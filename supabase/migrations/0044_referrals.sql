-- =====================================================================
-- 0044: Sales & Referrals
--   A salesperson is a normal player the admin gives a referral code
--   (e.g. LAKI10). Invite link: /register?ref=LAKI10.
--   New players who sign up with the link are saved in
--   profiles.referred_by (set once, at sign-up, by the server only).
--
--   Commission comes ONLY from the house's own cut, never from players'
--   stakes or winnings, and is paid when the house cut is earned, i.e.
--   when the round / challenge SETTLES:
--     * Main rounds : 5% of the round's house cut on the referred player's
--                     stakes (1 Unit slip, 30% cut -> 0.3 to the house ->
--                     0.015 Unit commission -> 0.01 after rounding down).
--     * Challenges  : 2% of the challenge fee (fee_pct) on the referred
--                     player's stake.
--     * No commission when the stake was refunded: solo refund (0039),
--       every match called off, refunded challenge.
--     * Nobody won / house keeps the whole pool: still only 5% of the
--       NORMAL house cut. The salesperson never earns more because nobody won.
--     * Private leagues: no commission (not in scope).
--     * The code was removed by the admin: no new commission.
--   Rounding: integer cents, rounded DOWN to 0.01 Unit, per player per
--   round / challenge. Less than 0.01 Unit is skipped (not carried over).
--   Every commission is a wallet_ledger row (kind 'commission') plus a
--   referral_earnings row (unique per player + round / challenge, so it
--   is never paid twice).
--   Payouts to salespeople use the normal withdrawal flow.
-- Needs 0039 and 0040 first. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------- 1. profiles
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists referred_at timestamptz;
alter table public.profiles add column if not exists referral_ip text;

alter table public.profiles drop constraint if exists profiles_referral_code_check;
alter table public.profiles add constraint profiles_referral_code_check
  check (referral_code is null or referral_code ~ '^[A-Z0-9]{3,20}$');
alter table public.profiles drop constraint if exists profiles_no_self_referral;
alter table public.profiles add constraint profiles_no_self_referral
  check (referred_by is null or referred_by <> id);
create unique index if not exists profiles_referral_code_idx on public.profiles (referral_code) where referral_code is not null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;
-- Players can still only update their username (0001); the new columns are server-only.

-- ---------------------------------------------------------- 2. ledger kind
alter table public.wallet_ledger drop constraint if exists wallet_ledger_kind_check;
alter table public.wallet_ledger add constraint wallet_ledger_kind_check
  check (kind in ('deposit', 'withdrawal', 'entry_fee', 'payout', 'refund', 'adjustment', 'subscription', 'commission'));

-- ---------------------------------------------------------- 3. earnings
create table if not exists public.referral_earnings (
  id             bigint generated always as identity primary key,
  salesperson_id uuid not null references public.profiles (id) on delete cascade,
  player_id      uuid not null references public.profiles (id) on delete cascade,
  round_id       bigint references public.rounds (id),
  challenge_id   bigint references public.challenges (id),
  stake_units    numeric(12,2) not null check (stake_units > 0),
  house_pct      numeric(4,3) not null,   -- round house_cut or challenge fee_pct
  share_pct      numeric(4,3) not null,   -- 0.05 rounds, 0.02 challenges
  amount_units   numeric(12,2) not null check (amount_units >= 0.01),
  ledger_id      bigint references public.wallet_ledger (id) on delete set null,
  label          text,
  created_at     timestamptz not null default now(),
  constraint referral_earnings_one_source check (num_nonnulls(round_id, challenge_id) = 1)
);
create unique index if not exists referral_earnings_round_uq on public.referral_earnings (player_id, round_id) where round_id is not null;
create unique index if not exists referral_earnings_challenge_uq on public.referral_earnings (player_id, challenge_id) where challenge_id is not null;
create index if not exists referral_earnings_sales_idx on public.referral_earnings (salesperson_id, created_at desc);
alter table public.referral_earnings enable row level security;
revoke all on public.referral_earnings from public, anon, authenticated;
-- No direct reads: players use get_my_sales(); admins use the service role.

-- ---------------------------------------------------------- 4. sign-up
-- Called by the server (service role) right after a new account is made.
-- Sets referred_by once; unknown codes and self-referrals are ignored.
create or replace function public.apply_referral(p_user_id uuid, p_code text, p_ip text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_sales uuid;
begin
  if p_user_id is null or p_code is null then return false; end if;
  select id into v_sales from public.profiles where referral_code = upper(trim(p_code));
  if v_sales is null or v_sales = p_user_id then return false; end if;
  update public.profiles
     set referred_by = v_sales, referred_at = now(), referral_ip = left(p_ip, 64)
   where id = p_user_id
     and referred_by is null
     and created_at > now() - interval '1 day';   -- only right after sign-up
  return found;
end $$;
revoke execute on function public.apply_referral(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.apply_referral(uuid, text, text) to service_role;

-- ---------------------------------------------------------- 5. pay one commission
-- Internal: used by settle_round_slips and settle_challenge_if_due only.
-- Mirror of lib/referrals.ts commissionCents():
--   cents = floor(stake_cents * house_pct * share_pct), skip if < 1 cent.
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

  v_cents := floor(round(p_stake * 100) * p_house_pct * p_share);
  if v_cents < 1 then return 0; end if;            -- below 0.01 Unit: skipped
  v_amt := v_cents / 100.0;

  -- The unique index makes a second payment for the same player + round/challenge impossible.
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

-- ---------------------------------------------------------- 6. main rounds
-- Same as 0039 (solo refund kept), plus the sales commission after payouts.
create or replace function public.settle_round_slips(
  p_round_id bigint, p_points jsonb, p_slams jsonb, p_payouts jsonb, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round   public.rounds;
  v_fund    numeric;
  v_paid    numeric;
  v_bar     numeric;
  v_players int;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'round not found'; end if;
  if v_round.status not in ('open', 'locked') then raise exception 'round already %', v_round.status; end if;
  if exists (select 1 from public.matches where round_id = p_round_id and status not in ('finished', 'cancelled', 'postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select count(distinct user_id) into v_players from public.slips where round_id = p_round_id;

  select prize_fund_units into v_fund from public.get_round_pool(p_round_id);
  select coalesce(sum((x ->> 'units')::numeric), 0) into v_paid from jsonb_array_elements(p_payouts) x;
  if v_paid > coalesce(v_fund, 0) + 0.001 then raise exception 'payouts (%) exceed prize fund (%)', v_paid, v_fund; end if;
  if v_players = 1 and v_paid > 0 then raise exception 'only one player in this round: refund, no payouts'; end if;
  if exists (select 1 from jsonb_array_elements(p_payouts) x
              where not exists (select 1 from public.slips s where s.id = (x ->> 'slip_id')::bigint and s.round_id = p_round_id)) then
    raise exception 'payout to a slip outside this round';
  end if;

  update public.slip_picks sp set points_earned = (x ->> 'points')::numeric
    from jsonb_array_elements(p_points) x
   where sp.id = (x ->> 'pick_id')::bigint
     and sp.slip_id in (select id from public.slips where round_id = p_round_id);
  update public.slips s set slam_points = (x ->> 'slam_points')::numeric
    from jsonb_array_elements(p_slams) x
   where s.id = (x ->> 'slip_id')::bigint and s.round_id = p_round_id;

  update public.predictions p set points_earned = sp.points_earned
    from public.slip_picks sp join public.slips s on s.id = sp.slip_id
   where s.round_id = p_round_id and s.slip_no = 1 and p.user_id = s.user_id and p.match_id = sp.match_id;
  update public.round_entries e set slam_points = s.slam_points
    from public.slips s where s.round_id = p_round_id and s.slip_no = 1 and e.round_id = p_round_id and e.user_id = s.user_id;

  -- Only one player (any number of slips): every stake back in full, no fee, no winner.
  -- No house cut, so no sales commission either.
  if v_players = 1 then
    insert into public.wallet_ledger (user_id, amount_units, kind, round_id, slip_id, reference, created_by)
    select s.user_id, t.owed, 'refund', p_round_id, s.id,
           'Slip #' || s.slip_no || ': nobody else joined, stake refunded in full', p_admin_id
      from public.slips s
      cross join lateral (
        select -coalesce(sum(l.amount_units) filter (where l.kind = 'entry_fee'), 0)
               - coalesce(sum(l.amount_units) filter (where l.kind = 'refund'), 0) owed
          from public.wallet_ledger l where l.slip_id = s.id
      ) t
     where s.round_id = p_round_id and t.owed > 0
     order by s.slip_no;
    update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
    return;
  end if;

  -- winning bar: more than half of 3 points x finished matches
  v_bar := 1.5 * (select count(*) from public.matches where round_id = p_round_id and status = 'finished');
  if exists (
    select 1 from jsonb_array_elements(p_payouts) x
     where (x ->> 'units')::numeric > 0
       and (select coalesce(sum(sp.points_earned), 0) from public.slip_picks sp where sp.slip_id = (x ->> 'slip_id')::bigint) <= v_bar
  ) then
    raise exception 'a winning slip needs more than % match points', v_bar;
  end if;

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, slip_id, reference, created_by)
  select s.user_id, (x ->> 'units')::numeric, 'payout', p_round_id, s.id,
         'Slip #' || s.slip_no || ' winnings (Rank ' || coalesce(x ->> 'rank', '1') || ')', p_admin_id
    from jsonb_array_elements(p_payouts) x join public.slips s on s.id = (x ->> 'slip_id')::bigint
   where (x ->> 'units')::numeric > 0;

  -- Sales commission: 5% of the round's NORMAL house cut on each referred
  -- player's stakes (net of any refund). Same even if nobody won.
  -- Every match called off: no commission.
  if exists (select 1 from public.matches where round_id = p_round_id and status = 'finished') then
    perform public.pay_referral_commission(t.user_id, p_round_id, null, t.stake, v_round.house_cut, 0.05,
                                           coalesce(nullif(trim(v_round.name), ''), 'Round ' || v_round.id))
       from (
         select l.user_id, -sum(l.amount_units) stake
           from public.wallet_ledger l
          where l.round_id = p_round_id and l.league_id is null and l.challenge_id is null
            and l.kind in ('entry_fee', 'refund')
          group by l.user_id
       ) t
       join public.profiles pr on pr.id = t.user_id
      where pr.referred_by is not null and t.stake > 0;
  end if;

  update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
end $$;
revoke execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) to service_role;

-- ---------------------------------------------------------- 7. challenges
-- Same as 0040 (extra picks + solo refund kept), plus the sales commission
-- when the challenge settles. Refunded challenges pay no commission.
create or replace function public.settle_challenge_if_due(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c          public.challenges;
  v_players  int;
  v_counted  int;
  v_pot      numeric;
  v_prize_c  bigint;
  v_winners  int;
  v_each     numeric;
begin
  select * into c from public.challenges where id = p_id for update;
  if c.id is null or c.status <> 'open' or c.lock_at > now() then return null; end if;
  select count(distinct user_id) into v_players from public.challenge_entries where challenge_id = c.id;

  -- Nobody else joined before the first kickoff: the stake goes back in full.
  if v_players < 2 then
    insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference)
    select user_id, c.stake_units, 'refund', c.id, 'Challenge ' || c.code || ': nobody else joined, stake refunded in full'
      from public.challenge_entries where challenge_id = c.id;
    update public.challenges set status = 'refunded', settled_at = now() where id = c.id;
    return 'refunded';
  end if;

  -- Wait until every match is over (finished with a score, or called off).
  if exists (
    select 1 from public.challenge_matches cm join public.matches m on m.id = cm.match_id
     where cm.challenge_id = c.id
       and not (m.status in ('cancelled', 'postponed')
                or (m.status = 'finished' and m.actual_home_score is not null and m.actual_away_score is not null))
  ) then
    return null;
  end if;

  select count(*) into v_counted
    from public.challenge_matches cm join public.matches m on m.id = cm.match_id
   where cm.challenge_id = c.id and m.status = 'finished';

  -- Every match called off: everyone gets their stake back.
  if v_counted = 0 then
    insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference)
    select user_id, c.stake_units, 'refund', c.id, 'Challenge ' || c.code || ': matches called off'
      from public.challenge_entries where challenge_id = c.id;
    update public.challenges set status = 'refunded', settled_at = now() where id = c.id;
    return 'refunded';
  end if;

  -- Score every pick: 3 / 1.5 / 1 / 0 for the score, +1 per right extra pick.
  -- Called-off matches score 0 for everyone.
  update public.challenge_picks p
     set prop_points = case when m.status = 'finished'
                            then public.calc_prop_points(p.btts, p.over25, p.ht, m.actual_home_score, m.actual_away_score, m.ht_home_score, m.ht_away_score)
                            else 0 end,
         points      = case when m.status = 'finished'
                            then public.calc_points(p.home, p.away, m.actual_home_score, m.actual_away_score)
                               + public.calc_prop_points(p.btts, p.over25, p.ht, m.actual_home_score, m.actual_away_score, m.ht_home_score, m.ht_away_score)
                            else 0 end
    from public.challenge_entries e, public.matches m
   where e.id = p.entry_id and e.challenge_id = c.id and m.id = p.match_id;

  -- Tie-breaks look at the SCORE picks only (points minus extra-pick points).
  update public.challenge_entries e set
    points      = t.pts,
    correct     = t.correct,
    exact       = t.exact,
    close_picks = t.close_n,
    goals_away  = t.away
  from (
    select p.entry_id,
           coalesce(sum(p.points), 0) pts,
           count(*) filter (where p.points - coalesce(p.prop_points, 0) > 0) correct,
           count(*) filter (where p.points - coalesce(p.prop_points, 0) = 3) exact,
           count(*) filter (where p.points - coalesce(p.prop_points, 0) = 1.5) close_n,
           coalesce(sum(abs(p.home - m.actual_home_score) + abs(p.away - m.actual_away_score)) filter (where m.status = 'finished'), 0) away
      from public.challenge_picks p
      join public.challenge_entries e2 on e2.id = p.entry_id and e2.challenge_id = c.id
      join public.matches m on m.id = p.match_id
     group by p.entry_id
  ) t
  where e.id = t.entry_id;

  -- Rank: points, then correct results, exact scores, close picks, fewest goals away.
  update public.challenge_entries e set rank = r.rk
    from (
      select id, rank() over (order by points desc, correct desc, exact desc, close_picks desc, goals_away asc) rk
        from public.challenge_entries where challenge_id = c.id
    ) r
   where e.id = r.id;

  -- Pot minus the fee, shared equally by everyone in first place (rounded down to 0.01).
  v_pot := c.stake_units * v_players;
  v_prize_c := floor(v_pot * (1 - c.fee_pct) * 100);
  select count(*) into v_winners from public.challenge_entries where challenge_id = c.id and rank = 1;
  v_each := floor(v_prize_c::numeric / v_winners) / 100;

  update public.challenge_entries set payout_units = case when rank = 1 then v_each else 0 end
   where challenge_id = c.id;
  insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference)
  select user_id, v_each, 'payout', c.id, 'Challenge ' || c.code || ' winnings'
    from public.challenge_entries where challenge_id = c.id and rank = 1 and v_each > 0;

  -- Sales commission: 2% of the fee on each referred player's stake.
  perform public.pay_referral_commission(e.user_id, null, c.id, c.stake_units, c.fee_pct, 0.02, 'Challenge ' || c.code)
     from public.challenge_entries e join public.profiles pr on pr.id = e.user_id
    where e.challenge_id = c.id and pr.referred_by is not null;

  insert into public.notifications (user_id, kind, title, body, link)
  select e.user_id, 'challenge_result', '📊 Challenge “' || c.title || '” finished',
         'You finished #' || e.rank || ' of ' || v_players || ' with ' || public.fmt_units(e.points) || ' points. Better luck next time!',
         '/challenges/' || c.code
    from public.challenge_entries e where e.challenge_id = c.id and e.rank > 1;

  update public.challenges set status = 'settled', settled_at = now(), prize_units = v_each * v_winners where id = c.id;
  return 'settled';
end $$;
revoke execute on function public.settle_challenge_if_due(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------- 8. wallet message
-- Same as 0039, plus one branch for 'commission' (in the app only, no
-- Telegram push, so small commissions don't spam the salesperson).
create or replace function public.notify_ledger_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bal   numeric;
  v_amt   text := public.fmt_units(new.amount_units) || ' Unit' ||
                  case when abs(new.amount_units) = 1 then '' else 's' end ||
                  ' (' || public.fmt_etb(new.amount_units) || ' ETB)';
  v_title text;
  v_body  text;
  v_link  text := '/wallet';
  v_push  boolean := true;
  v_round text;
  v_slip  text;
  v_ch    public.challenges;
begin
  select balance_units into v_bal from public.profiles where id = new.user_id;
  if new.challenge_id is not null then
    select * into v_ch from public.challenges where id = new.challenge_id;
    v_round := 'challenge “' || v_ch.title || '”';
    v_link  := '/challenges/' || v_ch.code;
  elsif new.league_id is not null then
    select 'league “' || name || '”' into v_round from public.leagues where id = new.league_id;
  else
    select coalesce(nullif(trim(name), ''), 'Round ' || id) into v_round from public.rounds where id = new.round_id;
  end if;
  if new.slip_id is not null then
    select 'Slip #' || slip_no into v_slip from public.slips where id = new.slip_id;
  end if;

  if new.kind = 'deposit' then
    v_title := '💰 Deposit received';
    v_body  := '+' || v_amt || ' added to your wallet.';
  elsif new.kind = 'payout' then
    v_title := '🏆 You won!';
    v_body  := '+' || v_amt || ' from ' || coalesce(v_round, 'your round') || coalesce(' (' || v_slip || ')', '') || '. Congratulations!';
    if new.challenge_id is null then
      v_link := case when new.league_id is not null then '/leagues' else '/results' end;
    end if;
  elsif new.kind = 'commission' then
    v_title := '🤝 Sales commission';
    v_body  := '+' || v_amt || ' from a player you invited (' ||
               coalesce(nullif(replace(new.reference, 'Sales commission · ', ''), ''), 'a game') || '). Thank you!';
    v_link  := '/sales';
    v_push  := false;
  elsif new.kind = 'refund' and new.reference like 'Withdrawal #% rejected' then
    v_title := '❌ ' || replace(new.reference, ' rejected', ' not sent');
    v_body  := '+' || v_amt || ' returned to your wallet.';
  elsif new.kind = 'refund' and new.reference like '%nobody else joined%' then
    v_title := '↩️ Stake refunded · ' || coalesce(v_round, 'your round') || coalesce(' (' || v_slip || ')', '');
    v_body  := 'Nobody else joined, so your stake was refunded in full: +' || v_amt || '.';
  elsif new.kind = 'refund' then
    v_title := '↩️ Units returned';
    v_body  := '+' || v_amt || ' back in your wallet' || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'adjustment' then
    v_title := case when new.amount_units > 0 then '➕ Units added' else '➖ Units deducted' end;
    v_body  := case when new.amount_units > 0 then '+' else '−' end || v_amt || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'entry_fee' and new.challenge_id is not null then
    v_title := '🤝 You''re in: ' || v_round;
    v_body  := v_amt || ' stake locked. You can change your scores until the first kickoff.';
    v_push  := new.created_by is distinct from new.user_id;
  elsif new.kind = 'entry_fee' then
    v_title := case when v_slip is not null then '🎟️ ' || v_slip || ' placed · ' || coalesce(v_round, 'the round')
                    else '⚽ You joined ' || coalesce(v_round, 'the round') end;
    v_body  := v_amt || ' paid. You can edit your picks until the first kickoff. Good luck!';
    v_link  := case when new.league_id is not null then '/leagues' else '/dashboard' end;
    v_push  := new.created_by is distinct from new.user_id;
  elsif new.kind = 'withdrawal' then
    v_title := '⏳ Withdrawal requested';
    v_body  := v_amt || ' is on hold for you. We''ll send it to your Telebirr soon.';
    v_push  := false;
  else
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, push)
  values (new.user_id, new.kind, v_title, v_body || ' Balance: ' || public.fmt_units(coalesce(v_bal, 0)) || ' Units.', v_link, v_push);
  return new;
end $$;
revoke execute on function public.notify_ledger_entry() from public, anon, authenticated;

-- ---------------------------------------------------------- 9. sales page
-- The signed-in salesperson's own numbers only (never anyone else's).
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
    'total_units', (select coalesce(sum(amount_units), 0) from public.referral_earnings where salesperson_id = v_uid),
    'earnings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', x.created_at, 'amount_units', x.amount_units, 'stake_units', x.stake_units,
               'label', x.label, 'kind', case when x.challenge_id is not null then 'challenge' else 'round' end,
               'player', x.username) order by x.created_at desc)
        from (select re.*, p.username from public.referral_earnings re join public.profiles p on p.id = re.player_id
               where re.salesperson_id = v_uid order by re.created_at desc limit 200) x), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('username', p.username, 'joined_at', p.referred_at) order by p.referred_at desc)
        from (select username, referred_at from public.profiles where referred_by = v_uid order by referred_at desc limit 200) p), '[]'::jsonb)
  );
end $$;
revoke execute on function public.get_my_sales() from public, anon;
grant  execute on function public.get_my_sales() to authenticated;

notify pgrst, 'reload schema';
