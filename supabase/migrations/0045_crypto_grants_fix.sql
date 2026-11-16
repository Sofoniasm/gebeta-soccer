-- =====================================================================
-- 0045: Lock down crypto_deposits (fix for 0042).
--   0042 only removed insert / update / delete from the browser roles.
--   Supabase also gives them TRUNCATE, REFERENCES and TRIGGER by default,
--   which the security test (and good practice) does not allow.
--   Players keep reading their own rows (RLS policy from 0042);
--   logged-out visitors get nothing.
-- Safe to re-run.
-- =====================================================================

revoke all on public.crypto_deposits from anon, authenticated;
grant select on public.crypto_deposits to authenticated;
