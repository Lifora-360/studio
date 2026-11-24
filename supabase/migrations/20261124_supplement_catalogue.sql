-- Supplement catalogue for the Supplements tool (Studio).
-- Cost price ("O - Price per bottle") is internal: readable only by payment admins, never shown to clients.
-- Additive only.

create table if not exists public.supplement_catalogue (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 120),
  pack text not null check (pack in ('30s','60s')),
  unit text not null default 'tablets' check (unit in ('tablets','sprays','pack')),
  per_pack int check (per_pack is null or per_pack > 0),
  timing text,
  morning int not null default 0 check (morning between 0 and 9),
  afternoon int not null default 0 check (afternoon between 0 and 9),
  evening int not null default 0 check (evening between 0 and 9),
  dinner int not null default 0 check (dinner between 0 and 9),
  cost_price numeric(10,2) not null check (cost_price >= 0),
  client_price numeric(10,2) not null check (client_price >= 0),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  unique (name, pack)
);

alter table public.supplement_catalogue enable row level security;
revoke all on public.supplement_catalogue from anon, authenticated;
grant select on public.supplement_catalogue to authenticated;
drop policy if exists "admins read supplement catalogue" on public.supplement_catalogue;
-- Same admin check as the live payment_requests policy.
create policy "admins read supplement catalogue" on public.supplement_catalogue
  for select to authenticated using (exists (select 1 from public.payment_admins a where a.user_id = (select auth.uid())));

-- Prices are deliberately NOT stored in this repository (cost prices are confidential).
-- The table was filled directly in Supabase from the Drive sheet "Prescription"
-- (tabs Referral Prescription 30s / 60s) on 24 Nov 2026. Edit prices in the Supabase table editor.
