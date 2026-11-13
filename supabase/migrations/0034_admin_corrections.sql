-- =====================================================================
-- 0034: Admin corrections are not deposits.
-- Real money from a player is recorded on Admin -> Deposits (kind 'deposit':
-- ETB amount, minimum, the player's weekly deposit limit, 18+).
-- The "Add" button on a player's page is for bonuses and fixing mistakes:
-- it now records kind 'adjustment', so it no longer counts as money
-- deposited in the totals. Safe to re-run.
-- =====================================================================
create or replace function public.admin_add_correction(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units is null or p_units <= 0 then raise exception 'units must be positive'; end if;
  if p_units > 50 then raise exception 'maximum is 50 units per correction'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'player not found'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, p_units, 'adjustment', coalesce(nullif(trim(p_reference), ''), 'Correction by admin'), p_admin_id);
end $$;
revoke execute on function public.admin_add_correction(uuid, numeric, text, uuid) from public, anon, authenticated;
grant  execute on function public.admin_add_correction(uuid, numeric, text, uuid) to service_role;
