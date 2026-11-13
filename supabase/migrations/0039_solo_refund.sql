-- =====================================================================
-- 0039: Solo refund — a player never "wins" only their own money.
--   When a challenge, private league or main round settles and only ONE
--   distinct player took part (one user, even with several slips), every
--   stake goes back in full: no house fee, no winner, kind 'refund'.
--     * Main rounds  : settle_round_slips refunds every slip's stake.
--     * Leagues      : settle_league refunds the one member's entry fee.
--     * Challenges   : already refunded a lone player at the first kickoff
--                      (0021); only the wording changes here.
--   The wallet notification says:
--     "Nobody else joined, so your stake was refunded in full."
-- Safe to re-run (create or replace only; refunds are never paid twice).
-- =====================================================================

-- ---------------------------------------------------------- 1. main rounds
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

  update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
end $$;
revoke execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) to service_role;

-- ---------------------------------------------------------- 2. private leagues
create or replace function public.settle_league(p_league_id bigint, p_payouts jsonb, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  l         public.leagues;
  v_fund    numeric;
  v_paid    numeric;
  v_players int;
begin
  select * into l from public.leagues where id = p_league_id for update;
  if l.id is null then raise exception 'league not found'; end if;
  if l.status <> 'open' then raise exception 'league already %', l.status; end if;
  if exists (select 1 from public.matches where round_id = l.round_id
              and status not in ('finished', 'cancelled', 'postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select count(*) into v_players from public.league_members where league_id = p_league_id and status = 'active';

  select prize_fund_units into v_fund from public.get_league_pool(p_league_id);
  select coalesce(sum((x ->> 'units')::numeric), 0) into v_paid from jsonb_array_elements(p_payouts) x;
  if v_paid > coalesce(v_fund, 0) + 0.001 then
    raise exception 'payouts (%) exceed prize fund (%)', v_paid, v_fund;
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

-- ---------------------------------------------------------- 3. challenges
-- Same as 0021; a lone player was already refunded in full. Only the
-- refund wording changes so the wallet message reads the same everywhere.
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

  -- Score every pick (same 3 / 1.5 / 1 / 0 rules; called-off matches score 0).
  update public.challenge_picks p
     set points = case when m.status = 'finished'
                       then public.calc_points(p.home, p.away, m.actual_home_score, m.actual_away_score) else 0 end
    from public.challenge_entries e, public.matches m
   where e.id = p.entry_id and e.challenge_id = c.id and m.id = p.match_id;

  update public.challenge_entries e set
    points      = t.pts,
    correct     = t.correct,
    exact       = t.exact,
    close_picks = t.close_n,
    goals_away  = t.away
  from (
    select p.entry_id,
           coalesce(sum(p.points), 0) pts,
           count(*) filter (where p.points > 0) correct,
           count(*) filter (where p.points = 3) exact,
           count(*) filter (where p.points = 1.5) close_n,
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

  insert into public.notifications (user_id, kind, title, body, link)
  select e.user_id, 'challenge_result', '📊 Challenge “' || c.title || '” finished',
         'You finished #' || e.rank || ' of ' || v_players || ' with ' || public.fmt_units(e.points) || ' points. Better luck next time!',
         '/challenges/' || c.code
    from public.challenge_entries e where e.challenge_id = c.id and e.rank > 1;

  update public.challenges set status = 'settled', settled_at = now(), prize_units = v_each * v_winners where id = c.id;
  return 'settled';
end $$;
revoke execute on function public.settle_challenge_if_due(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------- 4. wallet message
-- Same as 0021, plus one branch: a solo refund says
-- "Nobody else joined, so your stake was refunded in full."
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
