-- Manual Telegram wallet: the admin adds or deducts units by hand.
-- Every change is still a row in wallet_ledger ("Manual Telegram Adjustment").

-- Add units (manual deposit): 0 < units <= 50 per transaction.
create or replace function public.admin_add_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units is null or p_units <= 0 then raise exception 'units must be positive'; end if;
  if p_units > 50 then raise exception 'maximum is 50 units (10,000 ETB) per transaction'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, p_units, 'deposit', coalesce(nullif(trim(p_reference), ''), 'Manual Telegram Adjustment'), p_admin_id);
end $$;

-- Deduct units (manual correction / cash-out handled outside the app).
-- Fails with "insufficient balance" rather than going negative.
create or replace function public.admin_deduct_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units is null or p_units <= 0 then raise exception 'units must be positive'; end if;
  if p_units > 50 then raise exception 'maximum is 50 units per transaction'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, -p_units, 'adjustment', coalesce(nullif(trim(p_reference), ''), 'Manual Telegram Adjustment'), p_admin_id);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;

revoke execute on function public.admin_add_units(uuid, numeric, text, uuid)    from public, anon, authenticated;
revoke execute on function public.admin_deduct_units(uuid, numeric, text, uuid) from public, anon, authenticated;
grant  execute on function public.admin_add_units(uuid, numeric, text, uuid)    to service_role;
grant  execute on function public.admin_deduct_units(uuid, numeric, text, uuid) to service_role;
