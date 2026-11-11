-- =====================================================================
-- 0025: Responsible play, enforced by the database
--   * Take a break: a player pauses their own betting for 1, 7 or 30 days.
--     It can be extended but never shortened. Withdrawals still work.
--   * Weekly deposit limit (rolling 7 days), chosen by the player. Lowering
--     it works at once; raising or removing it waits 7 days (cooling-off).
--     admin_add_units refuses a deposit over the limit.
--   * Every bet payment (slip, challenge stake, league fee) needs a saved
--     date of birth showing 18+, and no active break. One trigger on the
--     wallet ledger covers every way of paying for a bet.
-- Safe to re-run.
-- =====================================================================

alter table public.profiles add column if not exists excluded_until timestamptz;
alter table public.profiles add column if not exists deposit_limit_units numeric(12,2);
alter table public.profiles add column if not exists deposit_limit_next_units numeric(12,2);
alter table public.profiles add column if not exists deposit_limit_next_at timestamptz;

-- The limit in force now (a pending raise/removal counts once its 7 days are up).
create or replace function public.effective_deposit_limit(p_user_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p.deposit_limit_next_at is not null and p.deposit_limit_next_at <= now()
              then p.deposit_limit_next_units else p.deposit_limit_units end
    from public.profiles p where p.id = p_user_id;
$$;
revoke execute on function public.effective_deposit_limit(uuid) from public, anon, authenticated;

create or replace function public.deposits_last_7_days(p_user_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_units), 0) from public.wallet_ledger
   where user_id = p_user_id and kind = 'deposit' and created_at > now() - interval '7 days';
$$;
revoke execute on function public.deposits_last_7_days(uuid) from public, anon, authenticated;

-- Player: take a break.
create or replace function public.take_a_break(p_days int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_days not in (1, 7, 30) then raise exception 'choose 1, 7 or 30 days'; end if;
  update public.profiles
     set excluded_until = greatest(coalesce(excluded_until, now()), now() + make_interval(days => p_days))
   where id = auth.uid()
  returning excluded_until into v_until;
  return v_until;
end $$;
revoke execute on function public.take_a_break(int) from public, anon;
grant  execute on function public.take_a_break(int) to authenticated;

-- Player: set, lower, raise or remove the weekly deposit limit (null = no limit).
-- Returns 'now' or 'in 7 days'.
create or replace function public.set_deposit_limit(p_units numeric) returns text
language plpgsql security definer set search_path = public as $$
declare v_cur numeric;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_units is not null and (p_units < 5 or p_units > 5000) then
    raise exception 'limit must be 1,000 to 1,000,000 ETB';
  end if;
  -- fold in a pending change whose waiting time is over
  update public.profiles set deposit_limit_units = deposit_limit_next_units, deposit_limit_next_units = null, deposit_limit_next_at = null
   where id = auth.uid() and deposit_limit_next_at is not null and deposit_limit_next_at <= now();
  select deposit_limit_units into v_cur from public.profiles where id = auth.uid();

  if p_units is not null and (v_cur is null or p_units <= v_cur) then
    -- new or stricter limit: straight away
    update public.profiles set deposit_limit_units = p_units, deposit_limit_next_units = null, deposit_limit_next_at = null where id = auth.uid();
    return 'now';
  end if;
  if p_units is null and v_cur is null then
    update public.profiles set deposit_limit_next_units = null, deposit_limit_next_at = null where id = auth.uid();
    return 'now';
  end if;
  -- looser limit or removal: only after 7 days
  update public.profiles set deposit_limit_next_units = p_units, deposit_limit_next_at = now() + interval '7 days' where id = auth.uid();
  return 'in 7 days';
end $$;
revoke execute on function public.set_deposit_limit(numeric) from public, anon;
grant  execute on function public.set_deposit_limit(numeric) to authenticated;

-- Admin deposits respect the player's limit.
create or replace function public.admin_add_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_limit numeric;
  v_used  numeric;
begin
  if p_units is null or p_units < 5 then raise exception 'minimum deposit is 5 units (1,000 ETB)'; end if;
  if p_units > 500 then raise exception 'maximum is 500 units (100,000 ETB) per transaction'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'player not found'; end if;
  perform 1 from public.profiles where id = p_user_id for update;
  v_limit := public.effective_deposit_limit(p_user_id);
  if v_limit is not null then
    v_used := public.deposits_last_7_days(p_user_id);
    if v_used + p_units > v_limit then
      raise exception 'over the player''s weekly deposit limit: % of % units used in the last 7 days', v_used, v_limit;
    end if;
  end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, p_units, 'deposit', coalesce(nullif(trim(p_reference), ''), 'Telegram deposit'), p_admin_id);
end $$;
revoke execute on function public.admin_add_units(uuid, numeric, text, uuid) from public, anon, authenticated;
grant  execute on function public.admin_add_units(uuid, numeric, text, uuid) to service_role;

-- Every bet payment goes through the ledger as 'entry_fee': check the player here.
create or replace function public.guard_bet_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if new.kind <> 'entry_fee' then return new; end if;
  select * into p from public.profiles where id = new.user_id;
  if p.excluded_until is not null and p.excluded_until > now() then
    raise exception 'betting paused: you are taking a break until %', to_char(p.excluded_until at time zone 'Africa/Addis_Ababa', 'DD Mon YYYY HH24:MI');
  end if;
  if p.date_of_birth is null then
    raise exception 'add your date of birth on your Profile before betting';
  end if;
  if not public.is_adult(p.date_of_birth) then
    raise exception 'you must be 18 or older to bet';
  end if;
  return new;
end $$;
revoke execute on function public.guard_bet_payment() from public, anon, authenticated;
drop trigger if exists wallet_ledger_guard_bet on public.wallet_ledger;
create trigger wallet_ledger_guard_bet before insert on public.wallet_ledger
for each row execute function public.guard_bet_payment();

-- What the Profile page shows the player about their own limits.
create or replace function public.get_my_play_limits()
returns table (excluded_until timestamptz, deposit_limit_units numeric, next_units numeric, next_at timestamptz, deposited_7d numeric)
language sql stable security definer set search_path = public as $$
  select p.excluded_until,
         public.effective_deposit_limit(p.id),
         case when p.deposit_limit_next_at > now() then p.deposit_limit_next_units end,
         case when p.deposit_limit_next_at > now() then p.deposit_limit_next_at end,
         public.deposits_last_7_days(p.id)
    from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.get_my_play_limits() from public, anon;
grant  execute on function public.get_my_play_limits() to authenticated;
