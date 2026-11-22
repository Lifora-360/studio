-- Lifora payments: checkout v2
-- Additive only. Safe to run more than once. Existing rows, functions and links keep working.
--
-- 1. Customers can report their UPI transaction reference (UTR) after paying.
--    It does NOT mark the request paid; an admin still verifies the credit and marks it.
-- 2. get_checkout() returns paid requests even after the link's expiry, so a customer
--    who reopens their link sees "Paid" instead of "not found".

alter table public.payment_requests
  add column if not exists customer_reference text
    check (customer_reference is null or char_length(customer_reference) between 6 and 40),
  add column if not exists reported_at timestamptz;

create or replace function public.get_checkout(p_payment_id uuid)
returns table(id uuid, customer_name text, purpose text, amount numeric, status text,
              expires_at timestamptz, paid_at timestamptz, reported boolean)
language sql stable security definer set search_path = public
as $$
  select r.id, r.customer_name, r.purpose, r.amount,
    case when r.status = 'pending' and r.expires_at < now() then 'expired' else r.status end,
    r.expires_at, r.paid_at, r.reported_at is not null
  from public.payment_requests r
  where r.id = p_payment_id
    and (r.status = 'paid' or r.expires_at > now())
  limit 1
$$;

create or replace function public.submit_payment_reference(p_payment_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = public
as $$
declare ref text := upper(regexp_replace(coalesce(p_reference, ''), '\s', '', 'g'));
begin
  if ref !~ '^[A-Z0-9]{6,40}$' then raise exception 'Enter the transaction reference shown in your UPI app'; end if;
  update public.payment_requests
     set customer_reference = ref, reported_at = now()
   where id = p_payment_id
     and status = 'pending'
     and expires_at > now()
     and (reported_at is null or reported_at < now() - interval '2 minutes');
  if not found then raise exception 'This request can''t take a reference right now'; end if;
end $$;

revoke all on function public.get_checkout(uuid) from public;
revoke all on function public.submit_payment_reference(uuid, text) from public;
grant execute on function public.get_checkout(uuid) to anon, authenticated;
grant execute on function public.submit_payment_reference(uuid, text) to anon, authenticated;
