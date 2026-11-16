-- =====================================================================
-- 0046: Referrals for EVERY player (change to 0044)
--   * Every player gets a referral code automatically (new players when
--     they sign up, old players once, now). The admin can still change a
--     code or remove it on the admin pages.
--   * One level only: a player earns only from the players they invited
--     themselves, never from friends of friends.
--   * Commission is now paid ONLY when the invited player WINS something
--     in that round / challenge. It is still paid from the HOUSE's cut
--     (5% of the house cut on rounds, 2% of the fee on challenges), never
--     taken from the winner's prize. Everything else from 0044 stays:
--     paid at settlement, whole cents rounded down, nothing for refunds,
--     never paid twice.
--   * get_my_sales() now also returns active friends, wins and a
--     friends list (games played, wins, commission per friend).
-- Needs 0044 first. Safe to re-run (old players are given codes only the
-- first time, so a code the admin removed later is not given back).
-- =====================================================================

-- ---------------------------------------------------------- 1. automatic codes
-- 6 characters, no 0/O/1/I, e.g. K7M4QX.
create or replace function public.make_referral_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end $$;
revoke execute on function public.make_referral_code() from public, anon, authenticated;

create or replace function public.profiles_give_referral_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referral_code is null then new.referral_code := public.make_referral_code(); end if;
  return new;
end $$;
revoke execute on function public.profiles_give_referral_code() from public, anon, authenticated;

-- Old players get a code once (only the first time this file is run).
do $$
declare r record;
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_referral_code' and tgrelid = 'public.profiles'::regclass) then
    for r in select id from public.profiles where referral_code is null loop
      update public.profiles set referral_code = public.make_referral_code() where id = r.id;
    end loop;
  end if;
end $$;

drop trigger if exists profiles_referral_code on public.profiles;
create trigger profiles_referral_code before insert on public.profiles
for each row execute function public.profiles_give_referral_code();

-- ---------------------------------------------------------- 2. pay only when the friend wins
-- Same as 0044, plus: the invited player must have won (a 'payout' row) in
-- this round / challenge. Called by settle_round_slips and
-- settle_challenge_if_due AFTER they have written the payouts.
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

-- ---------------------------------------------------------- 3. dashboard data
-- Only the signed-in player's own friends and numbers.
create or replace function public.get_my_sales() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select referral_code into v_code from public.profiles where id = v_uid;
  return jsonb_build_object(
    'code', v_code,
    'referred', (select count(*) from public.profiles where referred_by = v_uid),
    'active', (select count(distinct l.user_id) from public.wallet_ledger l
                 join public.profiles p on p.id = l.user_id
                where p.referred_by = v_uid and l.kind = 'entry_fee'),
    'wins', (select count(*) from public.referral_earnings where salesperson_id = v_uid),
    'total_units', (select coalesce(sum(amount_units), 0) from public.referral_earnings where salesperson_id = v_uid),
    'earnings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', x.created_at, 'amount_units', x.amount_units, 'stake_units', x.stake_units,
               'label', x.label, 'kind', case when x.challenge_id is not null then 'challenge' else 'round' end,
               'player', x.username) order by x.created_at desc)
        from (select re.*, p.username from public.referral_earnings re join public.profiles p on p.id = re.player_id
               where re.salesperson_id = v_uid order by re.created_at desc limit 200) x), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'username', f.username, 'joined_at', f.referred_at, 'games', f.games, 'wins', f.wins, 'earned', f.earned)
               order by f.referred_at desc)
        from (
          select p.username, p.referred_at,
                 (select count(distinct case when l.challenge_id is not null then 'c' || l.challenge_id else 'r' || l.round_id end)
                    from public.wallet_ledger l
                   where l.user_id = p.id and l.kind = 'entry_fee' and l.league_id is null) games,
                 (select count(*) from public.referral_earnings e where e.player_id = p.id and e.salesperson_id = v_uid) wins,
                 (select coalesce(sum(e.amount_units), 0) from public.referral_earnings e where e.player_id = p.id and e.salesperson_id = v_uid) earned
            from public.profiles p where p.referred_by = v_uid
           order by p.referred_at desc limit 500
        ) f), '[]'::jsonb)
  );
end $$;
revoke execute on function public.get_my_sales() from public, anon;
grant  execute on function public.get_my_sales() to authenticated;

notify pgrst, 'reload schema';
