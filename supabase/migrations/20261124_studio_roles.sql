-- Studio roles: admin (payment_admins) and staff (studio_staff, by email).
-- Staff: supplements, payment links, payment register. Admin only: cost prices and cost sheets.
-- Also: cost sheet fields for delivery address, delivery fee and commission; staff save orders
-- through a function that fills in cost prices server-side, so staff never receive them.

create table if not exists public.studio_staff (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.studio_staff enable row level security;
revoke all on public.studio_staff from anon, authenticated;

create or replace function public.is_studio_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select exists (select 1 from public.payment_admins where user_id = auth.uid()) $$;

create or replace function public.is_studio_member() returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select public.is_studio_admin()
   or exists (select 1 from public.studio_staff s where s.email = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;

create or replace function public.studio_role() returns text
language sql stable security definer set search_path = pg_catalog, public
as $$ select case when public.is_studio_admin() then 'admin' when public.is_studio_member() then 'staff' else null end $$;

revoke all on function public.is_studio_admin() from public;
revoke all on function public.is_studio_member() from public;
revoke all on function public.studio_role() from public;
grant execute on function public.is_studio_admin() to authenticated;
grant execute on function public.is_studio_member() to authenticated;
grant execute on function public.studio_role() to authenticated;

-- Payments: staff may create links, read the register and mark paid.
create or replace function public.create_payment_request(p_customer_name text, p_customer_phone text, purpose_text text, p_amount numeric, p_expires_at timestamp with time zone)
returns uuid language plpgsql security definer set search_path to 'pg_catalog', 'public'
as $function$
declare new_id uuid;
begin
 if not public.is_studio_member() then raise exception 'Not authorised'; end if;
 if length(trim(p_customer_name)) not between 1 and 100 then raise exception 'Invalid customer name'; end if;
 if length(trim(purpose_text)) not between 1 and 140 then raise exception 'Invalid payment purpose'; end if;
 if p_amount is null or p_amount < 0.01 or p_amount > 10000000 then raise exception 'Invalid amount'; end if;
 if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '31 days' then raise exception 'Invalid expiry'; end if;
 insert into public.payment_requests(customer_name,customer_phone,purpose,amount,expires_at,created_by)
 values(trim(p_customer_name),nullif(trim(p_customer_phone),''),trim(purpose_text),p_amount,p_expires_at,auth.uid())
 returning id into new_id;
 return new_id;
end $function$;

create or replace function public.mark_payment_paid(p_payment_id uuid, p_transaction_ref text)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'public'
as $function$
begin
 if not public.is_studio_member() then raise exception 'Not authorised'; end if;
 update public.payment_requests
 set status='paid',transaction_ref=nullif(left(trim(coalesce(p_transaction_ref,'')),120),''),paid_at=now()
 where id=p_payment_id and status='pending';
 if not found then raise exception 'Payment request not found or already updated'; end if;
end $function$;

drop policy if exists "staff read payment requests" on public.payment_requests;
create policy "staff read payment requests" on public.payment_requests
  for select to authenticated using (public.is_studio_member());

-- Catalogue for staff: everything except cost price.
create or replace function public.get_supplement_catalogue()
returns table(id bigint, name text, pack text, unit text, per_pack int, timing text,
              morning int, afternoon int, evening int, dinner int, client_price numeric, sort int)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select c.id, c.name, c.pack, c.unit, c.per_pack, c.timing, c.morning, c.afternoon, c.evening, c.dinner, c.client_price, c.sort
  from public.supplement_catalogue c
  where c.active and public.is_studio_member()
  order by c.sort, c.name
$$;
revoke all on function public.get_supplement_catalogue() from public;
grant execute on function public.get_supplement_catalogue() to authenticated;

-- Cost sheet fields.
alter table public.supplement_orders
  add column if not exists client_address text,
  add column if not exists delivery_fee numeric(12,2) not null default 0,
  add column if not exists commission_pct numeric(5,2) not null default 30,
  add column if not exists admin_edited boolean not null default false;

-- Staff save an order; cost prices are looked up here, never sent to the browser.
create or replace function public.save_supplement_order(p jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  it jsonb;
  c record;
  cost numeric;
  v_cost_total numeric := 0;
  v_client_total numeric := 0;
  existing record;
begin
  if not public.is_studio_member() then raise exception 'Not authorised'; end if;
  if coalesce(trim(p->>'bill_no'), '') = '' or coalesce(trim(p->>'client_name'), '') = '' then raise exception 'Bill number and client name are required'; end if;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    cost := 0;
    if coalesce(it->>'pack', '') <> 'custom' then
      select cost_price into c from public.supplement_catalogue where name = it->>'name' and pack = it->>'pack';
      if found then cost := c.cost_price; end if;
    end if;
    v_items := v_items || jsonb_build_object('name', it->>'name', 'pack', it->>'pack', 'label', it->>'label',
                                         'qty', (it->>'qty')::int, 'cost', cost, 'client', (it->>'client')::numeric);
    v_cost_total := v_cost_total + (it->>'qty')::int * cost;
    v_client_total := v_client_total + (it->>'qty')::int * (it->>'client')::numeric;
  end loop;

  select * into existing from public.supplement_orders where bill_no = p->>'bill_no';
  if not found then
    insert into public.supplement_orders(bill_no, bill_date, client_name, client_phone, client_address, doctor_name, days,
                                         items, local_items, cost_total, client_total, payment_request_id)
    values (p->>'bill_no', nullif(p->>'bill_date','')::date, trim(p->>'client_name'), nullif(trim(p->>'client_phone'),''),
            nullif(trim(p->>'client_address'),''), nullif(trim(p->>'doctor_name'),''), nullif(p->>'days','')::int,
            v_items, coalesce(p->'local_items', '[]'::jsonb), v_cost_total, v_client_total, nullif(p->>'payment_request_id','')::uuid);
  elsif existing.admin_edited then
    -- The admin has edited this cost sheet: keep their items and prices, only fill in new contact/payment details.
    update public.supplement_orders set
      payment_request_id = coalesce(nullif(p->>'payment_request_id','')::uuid, payment_request_id),
      client_phone = coalesce(client_phone, nullif(trim(p->>'client_phone'),'')),
      client_address = coalesce(client_address, nullif(trim(p->>'client_address'),'')),
      updated_at = now()
    where bill_no = p->>'bill_no';
  else
    update public.supplement_orders set
      bill_date = nullif(p->>'bill_date','')::date, client_name = trim(p->>'client_name'),
      client_phone = nullif(trim(p->>'client_phone'),''), client_address = nullif(trim(p->>'client_address'),''),
      doctor_name = nullif(trim(p->>'doctor_name'),''), days = nullif(p->>'days','')::int,
      items = v_items, local_items = coalesce(p->'local_items', '[]'::jsonb), cost_total = v_cost_total, client_total = v_client_total,
      payment_request_id = coalesce(nullif(p->>'payment_request_id','')::uuid, payment_request_id),
      updated_at = now()
    where bill_no = p->>'bill_no';
  end if;
end $$;
revoke all on function public.save_supplement_order(jsonb) from public;
grant execute on function public.save_supplement_order(jsonb) to authenticated;

-- Staff are listed by email (lower case); the account itself is created in Supabase Authentication.
-- Add someone:    insert into public.studio_staff(email) values ('name@example.com');
-- Remove someone: delete from public.studio_staff where email = 'name@example.com';
