-- Run once in Supabase SQL Editor to enable the admin accept/reject actions.
-- This is an additive change; do not rerun the full schema for this feature.
alter type public.quote_status add value if not exists 'aceptado';
alter type public.quote_status add value if not exists 'rechazado';
