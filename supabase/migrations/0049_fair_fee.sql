-- =====================================================================
-- 0049: Fair fee — the house only takes its cut from what a winner wins
--       FROM OTHER PLAYERS, never from the winner's own stake.
--   each winner = own stake back + (other players' stakes x (1 - cut)) / winners
--     * Challenge, 2 x 300 ETB, 10% fee : winner gets 300 + 270 = 570 (house 30)
--       (was 540: 10% of the whole 600 pot).
--     * Main round, 2 x 200 ETB, 30% cut: winner gets 200 + 140 = 340 (house 60)
--       (was 280).
--     * Private leagues: same rule with the league's entry fee and cut.
--   Everyone level in first place = nobody won from anybody: every stake back.
--   Unchanged: solo refund (0039), extra picks (0040), sales commission
--   (0044-0047: from the house cut, only when the friend wins), the
--   winning bar on main rounds, rounding down to 0.01 Unit.
--   get_round_pool / get_league_pool: prize_fund_units now means
--   "what ONE winner receives" (stake back + the others' stakes minus the cut).
-- Mirror of lib/settlement.ts fairPrize(). Needs 0044-0048 first. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------- 1. the maths
-- What ONE winner gets, rounded down to 0.01 (0 when nobody won).
create or replace function public.fair_prize_each(p_stake numeric, p_entrants int, p_winners int, p_cut numeric)
returns numeric language sql immutable set search_path = public as $$
  select case
    when coalesce(p_winners, 0) <= 0 or coalesce(p_entrants, 0) <= 0 or coalesce(p_stake, 0) <= 0 then 0
    else round(p_stake * 100) / 100
       + floor(round(p_stake * 100) * (p_entrants - least(p_winners, p_entrants)) * (1 - p_cut) / least(p_winners, p_entrants) + 0.000001) / 100
  end::numeric;
$$;

-- What ALL winners get together.
create or replace function public.fair_prize_total(p_stake numeric, p_entrants int, p_winners int, p_cut numeric)
returns numeric language sql immutable set search_path = public as $$
  select public.fair_prize_each(p_stake, p_entrants, p_winners, p_cut) * greatest(least(coalesce(p_winners, 0), coalesce(p_entrants, 0)), 0);
$$;

-- ---------------------------------------------------------- 2. pots shown on pages
-- prize_fund_units = what a lone winner would receive right now.
create or replace function public.get_round_pool(p_round_id bigint)
returns table (entrants bigint, pool_units numeric, prize_fund_units numeric, players bigint)
language sql stable security definer set search_path = public as $$
  select count(s.id),
         count(s.id) * r.entry_fee_units,
         public.fair_prize_each(r.entry_fee_units, count(s.id)::int, 1, r.house_cut),
         count(distinct s.user_id)
    from public.rounds r
    left join public.slips s on s.round_id = r.id
   where r.id = p_round_id
   group by r.id;
$$;
grant execute on function public.get_round_pool(bigint) to anon, authenticated;

create or replace function public.get_league_pool(p_league_id bigint)
returns table (members bigint, pending bigint, pool_units numeric, prize_fund_units numeric)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where m.status = 'active'),
         count(*) filter (where m.status = 'pending'),
         count(*) filter (where m.status = 'active') * l.entry_fee_units,
         public.fair_prize_each(l.entry_fee_units, (count(*) filter (where m.status = 'active'))::int, 1, l.house_cut)
    from public.leagues l
    left join public.league_members m on m.league_id = l.id
   where l.id = p_league_id
   group by l.id;
$$;
grant execute on function public.get_league_pool(bigint) to authenticated;

-- ---------------------------------------------------------- 3. main rounds
-- Same as 0044, with the fair-fee payout check.
create or replace function public.settle_round_slips(
  p_round_id bigint, p_points jsonb, p_slams jsonb, p_payouts jsonb, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round   public.rounds;
  v_paid    numeric;
  v_bar     numeric;
  v_players int;
  v_slips   int;
  v_wins    int;
  v_max     numeric;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'round not found'; end if;
  if v_round.status not in ('open', 'locked') then raise exception 'round already %', v_round.status; end if;
  if exists (select 1 from public.matches where round_id = p_round_id and status not in ('finished', 'cancelled', 'postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select count(distinct user_id) into v_players from public.slips where round_id = p_round_id;

  -- Fair fee (0049): each winner = own stake + losers' stakes x (1 - cut) / winners.
  -- The database checks the server's payouts never go above that.
  select count(*) into v_slips from public.slips where round_id = p_round_id;
  select count(*) filter (where (x ->> 'units')::numeric > 0), coalesce(sum((x ->> 'units')::numeric), 0)
    into v_wins, v_paid from jsonb_array_elements(p_payouts) x;
  v_max := public.fair_prize_total(v_round.entry_fee_units, v_slips, v_wins, v_round.house_cut);
  if v_paid > v_max + 0.001 then raise exception 'payouts (%) exceed the prize (%)', v_paid, v_max; end if;
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

-- ---------------------------------------------------------- 4. private leagues
-- Same as 0039, with the fair-fee payout check.
create or replace function public.settle_league(p_league_id bigint, p_payouts jsonb, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  l         public.leagues;
  v_fund    numeric;
  v_paid    numeric;
  v_players int;
  v_wins    int;
begin
  select * into l from public.leagues where id = p_league_id for update;
  if l.id is null then raise exception 'league not found'; end if;
  if l.status <> 'open' then raise exception 'league already %', l.status; end if;
  if exists (select 1 from public.matches where round_id = l.round_id
              and status not in ('finished', 'cancelled', 'postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select count(*) into v_players from public.league_members where league_id = p_league_id and status = 'active';

  -- Fair fee (0049): each winner = own fee + losers' fees x (1 - cut) / winners.
  select count(*) filter (where (x ->> 'units')::numeric > 0), coalesce(sum((x ->> 'units')::numeric), 0)
    into v_wins, v_paid from jsonb_array_elements(p_payouts) x;
  v_fund := public.fair_prize_total(l.entry_fee_units, v_players, v_wins, l.house_cut);
  if v_paid > v_fund + 0.001 then
    raise exception 'payouts (%) exceed the prize (%)', v_paid, v_fund;
  end if;
  if v_players = 1 and v_paid > 0 then raise exception 'only one player in this league: refund, no payouts'; end if;
  if exists (select 1 from jsonb_array_elements(p_payouts) x
              where not exists (select 1 from public.league_members m
                                 where m.league_id = p_league_id and m.status = 'active'
                                   and m.user_id = (x ->> 'user_id')::uuid)) then
    raise exception 'payout to a non-member';
  end if;

  if v_players = 1 then
    -- Only one member: the entry fee they paid goes back in full, no fee, no winner.
    insert into public.wallet_ledger (user_id, amount_units, kind, round_id, league_id, reference, created_by)
    select m.user_id, t.owed, 'refund', l.round_id, l.id,
           'League ' || l.name || ': nobody else joined, stake refunded in full', p_admin_id
      from public.league_members m
      cross join lateral (
        select -coalesce(sum(w.amount_units) filter (where w.kind = 'entry_fee'), 0)
               - coalesce(sum(w.amount_units) filter (where w.kind = 'refund'), 0) owed
          from public.wallet_ledger w where w.league_id = l.id and w.user_id = m.user_id
      ) t
     where m.league_id = p_league_id and m.status = 'active' and t.owed > 0;
  else
    insert into public.wallet_ledger (user_id, amount_units, kind, round_id, league_id, reference, created_by)
    select (x ->> 'user_id')::uuid, (x ->> 'units')::numeric, 'payout', l.round_id, l.id,
           'League ' || l.name || ' winnings (Rank ' || coalesce(x ->> 'rank', '1') || ')', p_admin_id
      from jsonb_array_elements(p_payouts) x
     where (x ->> 'units')::numeric > 0;
  end if;

  update public.league_members set status = 'rejected' where league_id = p_league_id and status = 'pending';
  update public.leagues set status = 'settled', settled_at = now() where id = p_league_id;
end $$;
revoke execute on function public.settle_league(bigint, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.settle_league(bigint, jsonb, uuid) to service_role;

-- ---------------------------------------------------------- 5. challenges
-- Same as 0044 (extra picks, solo refund, sales commission), with fair-fee payouts.
create or replace function public.settle_challenge_if_due(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c          public.challenges;
  v_players  int;
  v_counted  int;
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

  select count(*) into v_winners from public.challenge_entries where challenge_id = c.id and rank = 1;

  -- Everyone level in first place: nobody won anything from anybody,
  -- so every stake goes back in full (no fee, no commission).
  if v_winners >= v_players then
    update public.challenge_entries set payout_units = 0 where challenge_id = c.id;
    insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference)
    select user_id, c.stake_units, 'refund', c.id, 'Challenge ' || c.code || ': everyone finished level, stake refunded in full'
      from public.challenge_entries where challenge_id = c.id;
    update public.challenges set status = 'refunded', settled_at = now() where id = c.id;
    return 'refunded';
  end if;

  -- Fair fee (0049): each winner gets their own stake back + an equal share of
  -- the other players' stakes minus the fee (rounded down to 0.01).
  -- 2 x 300 ETB, 10% fee -> 300 + 270 = 570 ETB; the house keeps 30.
  v_each := public.fair_prize_each(c.stake_units, v_players, v_winners, c.fee_pct);

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
