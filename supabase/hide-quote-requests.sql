-- Run once in Supabase SQL Editor to let administrators hide requests from the dashboard.
-- Hidden requests remain stored in quote_requests and can be restored by setting the flag to false.
alter table public.quote_requests
  add column if not exists hidden_from_admin boolean not null default false;
