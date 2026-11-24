-- No upper length limits on names, purposes or item names (only "not empty").
-- The public UTR check in submit_payment_reference stays: it validates the format of a UPI reference.
alter table public.payment_requests drop constraint payment_requests_customer_name_check,
  add constraint payment_requests_customer_name_check check (char_length(customer_name) >= 1);
alter table public.payment_requests drop constraint payment_requests_purpose_check,
  add constraint payment_requests_purpose_check check (char_length(purpose) >= 1);
alter table public.supplement_orders drop constraint supplement_orders_client_name_check,
  add constraint supplement_orders_client_name_check check (char_length(client_name) >= 1);
alter table public.supplement_catalogue drop constraint supplement_catalogue_name_check,
  add constraint supplement_catalogue_name_check check (char_length(name) >= 1);
-- create_payment_request: name and purpose must be non-empty (no maximum).
-- mark_payment_paid: transaction reference stored in full.
-- (Function bodies as applied to the live project.)
