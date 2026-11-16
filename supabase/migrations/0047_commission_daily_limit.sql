-- =====================================================================
-- 0047: Daily commission limit per salesperson (fraud protection)
--   A salesperson can earn at most 2.5 Units (500 ETB) of commission per
--   day (Ethiopian time, Africa/Addis_Ababa). Commission is paid when a
--   round / challenge settles. If a payment would go over the limit, only
--   the part that still fits is paid; the rest is NOT paid and NOT carried
--   over to the next day. To change the limit, change the number in
--   referral_daily_cap() below (and DAILY_COMMISSION_CAP_UNITS in
--   lib/referrals.ts).
-- Needs 0046 first. Safe to re-run.
-- =====================================================================

create or replace function public.referral_daily_cap() returns numeric
language sql immutable as $$ select 2.5::numeric $$;   -- 2.5 Units = 500 ETB per salesperson per day
revoke execute on function public.referral_daily_cap() from public, anon, authenticated;

-- Same as 0046 (friend must win, from the house cut, once per game),
-- plus the daily limit.
create or replace function public.pay_referral_commission(
  p_player uuid, p_round_id bigint, p_challenge_id bigint,
  p_stake numeric, p_house_pct numeric, p_share numeric, p_label text
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_sales  uuid;
  v_name   text;
  v_cents  bigint;
  v_amt    numeric;
  v_today  numeric;
  v_room   numeric;
  v_earn   bigint;
  v_ledger bigint;
begin
  if p_stake is null or p_stake <= 0 or p_house_pct is null or p_house_pct <= 0 then return 0; end if;
  select s.id, pl.username into v_sales, v_name
    from public.profiles pl join public.profiles s on s.id = pl.referred_by
   where pl.id = p_player and s.referral_code is not null and s.id <> pl.id;
  if v_sales is null then return 0; end if;

  -- The friend must have won something in this game.
  if p_round_id is not null then
    if not exists (select 1 from public.wallet_ledger w
                    where w.user_id = p_player and w.kind = 'payout' and w.round_id = p_round_id
                      and w.league_id is null and w.challenge_id is null) then
      return 0;
    end if;
  elsif not exists (select 1 from public.wallet_ledger w
                     where w.user_id = p_player and w.kind = 'payout' and w.challenge_id = p_challenge_id) then
    return 0;
  end if;

  v_cents := floor(round(p_stake * 100) * p_house_pct * p_share);
  if v_cents < 1 then return 0; end if;            -- below 0.01 Unit: skipped
  v_amt := v_cents / 100.0;

  -- Daily limit: what this salesperson already earned today (Ethiopian time).
  perform 1 from public.profiles where id = v_sales for update;   -- one payment at a time per salesperson
  select coalesce(sum(amount_units), 0) into v_today
    from public.referral_earnings
   where salesperson_id = v_sales
     and created_at >= (date_trunc('day', now() at time zone 'Africa/Addis_Ababa') at time zone 'Africa/Addis_Ababa');
  v_room := public.referral_daily_cap() - v_today;
  if v_room < 0.01 then return 0; end if;
  v_amt := least(v_amt, floor(v_room * 100) / 100.0);

  insert into public.referral_earnings (salesperson_id, player_id, round_id, challenge_id, stake_units, house_pct, share_pct, amount_units, label)
  values (v_sales, p_player, p_round_id, p_challenge_id, p_stake, p_house_pct, p_share, v_amt, p_label)
  on conflict do nothing
  returning id into v_earn;
  if v_earn is null then return 0; end if;

  insert into public.wallet_ledger (user_id, amount_units, kind, reference)
  values (v_sales, v_amt, 'commission', 'Sales commission · ' || coalesce(p_label, 'game') || ' · ' || coalesce(v_name, 'player'))
  returning id into v_ledger;
  update public.referral_earnings set ledger_id = v_ledger where id = v_earn;
  return v_amt;
end $$;
revoke execute on function public.pay_referral_commission(uuid, bigint, bigint, numeric, numeric, numeric, text) from public, anon, authenticated;
