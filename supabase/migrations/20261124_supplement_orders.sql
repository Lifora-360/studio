-- Supplement orders: the internal cost sheet for every bill, saved automatically when staff
-- download a bill or create its payment link. Staff never download the cost sheet themselves;
-- it is viewed and downloaded from the private /cost-sheets/ page.
-- Additive only.

create table if not exists public.supplement_orders (
  id uuid primary key default gen_random_uuid(),
  bill_no text not null unique check (char_length(bill_no) between 4 and 40),
  bill_date date,
  client_name text not null check (char_length(client_name) between 1 and 100),
  client_phone text,
  doctor_name text,
  days int check (days is null or days between 1 and 365),
  items jsonb not null default '[]'::jsonb,       -- [{name, pack, label, qty, cost, client}]
  local_items jsonb not null default '[]'::jsonb, -- names bought from a local pharmacy (not billed)
  cost_total numeric(12,2) not null default 0,
  client_total numeric(12,2) not null default 0,
  payment_request_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplement_orders enable row level security;
revoke all on public.supplement_orders from anon, authenticated;
grant select, insert, update on public.supplement_orders to authenticated;

drop policy if exists "admins read supplement orders" on public.supplement_orders;
create policy "admins read supplement orders" on public.supplement_orders
  for select to authenticated using (exists (select 1 from public.payment_admins a where a.user_id = (select auth.uid())));
drop policy if exists "admins add supplement orders" on public.supplement_orders;
create policy "admins add supplement orders" on public.supplement_orders
  for insert to authenticated with check (exists (select 1 from public.payment_admins a where a.user_id = (select auth.uid())));
drop policy if exists "admins update supplement orders" on public.supplement_orders;
create policy "admins update supplement orders" on public.supplement_orders
  for update to authenticated using (exists (select 1 from public.payment_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.payment_admins a where a.user_id = (select auth.uid())));
