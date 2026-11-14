-- =====================================================================
-- 0040: Extra picks ("prop picks") in private challenges
--   The creator can switch on any of:
--     btts  Both teams to score (yes / no)          +1 point if right
--     ou25  Total goals over / under 2.5            +1 point if right
--     ht    Half-time result (home / draw / away)   +1 point if right
--   Everyone who joins must answer the same extra picks for every match.
--   Settled from the full-time score and the half-time score (new columns,
--   filled by the football-data.org sync). A called-off match scores 0, and
--   a missing half-time score makes that one pick 0 for everyone.
--   Stakes, refunds, the 10% fee and payouts are unchanged.
-- Safe to re-run.
-- Run BEFORE deploying the code that saves half-time scores.
-- =====================================================================

-- ---------------------------------------------------------- 1. columns
alter table public.matches add column if not exists ht_home_score smallint;
alter table public.matches add column if not exists ht_away_score smallint;

alter table public.challenges add column if not exists props text[] not null default '{}';
alter table public.challenges drop constraint if exists challenges_props_check;
alter table public.challenges add constraint challenges_props_check
  check (props <@ array['btts', 'ou25', 'ht']::text[]);

alter table public.challenge_picks add column if not exists btts boolean;
alter table public.challenge_picks add column if not exists over25 boolean;
alter table public.challenge_picks add column if not exists ht text;
alter table public.challenge_picks add column if not exists prop_points numeric(4,2);
alter table public.challenge_picks drop constraint if exists challenge_picks_ht_check;
alter table public.challenge_picks add constraint challenge_picks_ht_check check (ht is null or ht in ('H', 'D', 'A'));
-- points now holds score points + extra-pick points (max 3 + 3).
alter table public.challenge_picks alter column points type numeric(5,2);

-- ---------------------------------------------------------- 2. scoring
-- Mirror of lib/challenge-props.ts. NULL picks or missing scores give 0.
create or replace function public.calc_prop_points(
  p_btts boolean, p_over25 boolean, p_ht text, ah int, aa int, hh int, ha int
) returns numeric language sql immutable set search_path = public as $$
  select (
      case when p_btts is not null and ah is not null and aa is not null
                and p_btts = (ah > 0 and aa > 0) then 1 else 0 end
    + case when p_over25 is not null and ah is not null and aa is not null
                and p_over25 = (ah + aa > 2) then 1 else 0 end
    + case when p_ht is not null and hh is not null and ha is not null
                and p_ht = case when hh > ha then 'H' when hh < ha then 'A' else 'D' end then 1 else 0 end
  )::numeric;
$$;

-- ---------------------------------------------------------- 3. picks
-- Every match needs a score, plus an answer for every extra pick switched on.
drop function if exists public.validate_challenge_picks(bigint, jsonb);
create function public.validate_challenge_picks(p_challenge_id bigint, p_picks jsonb)
returns table (match_id bigint, home smallint, away smallint, btts boolean, over25 boolean, ht text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_need  int;
  v_got   int;
  v_props text[];
begin
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'picks must be a list'; end if;
  select coalesce(c.props, '{}') into v_props from public.challenges c where c.id = p_challenge_id;
  select count(*) into v_need from public.challenge_matches cm0 where cm0.challenge_id = p_challenge_id;
  select count(distinct (x ->> 'match_id')::bigint) into v_got
    from jsonb_array_elements(p_picks) x
    join public.challenge_matches cm on cm.match_id = (x ->> 'match_id')::bigint and cm.challenge_id = p_challenge_id
   where (x ->> 'home') ~ '^\d{1,2}$' and (x ->> 'away') ~ '^\d{1,2}$'
     and (x ->> 'home')::int between 0 and 20 and (x ->> 'away')::int between 0 and 20;
  if v_need = 0 or v_got <> v_need or jsonb_array_length(p_picks) <> v_need then
    raise exception 'enter a score for every match in the challenge';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_picks) x
     where ('btts' = any (v_props) and jsonb_typeof(x -> 'btts') is distinct from 'boolean')
        or ('ou25' = any (v_props) and jsonb_typeof(x -> 'over25') is distinct from 'boolean')
        or ('ht'   = any (v_props) and coalesce(x ->> 'ht', '') not in ('H', 'D', 'A'))
  ) then
    raise exception 'answer every extra pick for every match';
  end if;
  return query
    select (x ->> 'match_id')::bigint, (x ->> 'home')::smallint, (x ->> 'away')::smallint,
           case when 'btts' = any (v_props) then (x ->> 'btts')::boolean end,
           case when 'ou25' = any (v_props) then (x ->> 'over25')::boolean end,
           case when 'ht'   = any (v_props) then x ->> 'ht' end
      from jsonb_array_elements(p_picks) x;
end $$;
revoke execute on function public.validate_challenge_picks(bigint, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------- 4. player actions
drop function if exists public.create_challenge(text, numeric, int, jsonb);
create or replace function public.create_challenge(p_title text, p_stake numeric, p_max_players int, p_picks jsonb, p_props text[] default '{}')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_n     int;
  v_ok    int;
  v_lock  timestamptz;
  v_id    bigint;
  v_code  text;
  v_entry bigint;
  v_props text[] := coalesce(array(select distinct unnest(coalesce(p_props, '{}')) order by 1), '{}');
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 3 and 60 then raise exception 'name must be 3 to 60 characters'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 5000 or p_stake * 4 <> floor(p_stake * 4) then
    raise exception 'stake must be 200 to 1,000,000 ETB in steps of 50 ETB';
  end if;
  if p_max_players is not null and p_max_players not between 2 and 100 then raise exception 'max players must be 2 to 100'; end if;
  if not (v_props <@ array['btts', 'ou25', 'ht']::text[]) then raise exception 'unknown extra pick'; end if;
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'picks must be a list'; end if;

  v_n := jsonb_array_length(p_picks);
  if v_n < 1 or v_n > 10 then raise exception 'pick 1 to 10 matches'; end if;
  select count(distinct m.id), min(m.kickoff_at) into v_ok, v_lock
    from jsonb_array_elements(p_picks) x
    join public.matches m on m.id = (x ->> 'match_id')::bigint
   where m.status = 'scheduled' and m.kickoff_at > now() + interval '5 minutes'
     and (x ->> 'home') ~ '^\d{1,2}$' and (x ->> 'away') ~ '^\d{1,2}$'
     and (x ->> 'home')::int between 0 and 20 and (x ->> 'away')::int between 0 and 20;
  if v_ok <> v_n then raise exception 'every match must be upcoming and have a score'; end if;

  perform 1 from public.profiles where id = v_uid for update;
  v_code := public.challenge_code();
  insert into public.challenges (code, creator_id, title, stake_units, max_players, lock_at, props)
  values (v_code, v_uid, trim(p_title), p_stake, p_max_players, v_lock, v_props) returning id into v_id;
  insert into public.challenge_matches (challenge_id, match_id)
    select v_id, (x ->> 'match_id')::bigint from jsonb_array_elements(p_picks) x;
  insert into public.challenge_entries (challenge_id, user_id) values (v_id, v_uid) returning id into v_entry;
  insert into public.challenge_picks (entry_id, match_id, home, away, btts, over25, ht)
    select v_entry, v.match_id, v.home, v.away, v.btts, v.over25, v.ht from public.validate_challenge_picks(v_id, p_picks) v;

  insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Challenge ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke execute on function public.create_challenge(text, numeric, int, jsonb, text[]) from public, anon;
grant  execute on function public.create_challenge(text, numeric, int, jsonb, text[]) to authenticated;

create or replace function public.join_challenge(p_code text, p_picks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  c       public.challenges;
  v_n     int;
  v_entry bigint;
  v_name  text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  select * into c from public.challenges where code = upper(trim(p_code)) for update;
  if c.id is null then raise exception 'challenge not found'; end if;
  if c.status <> 'open' or c.lock_at <= now() then raise exception 'this challenge is closed'; end if;
  if exists (select 1 from public.challenge_entries where challenge_id = c.id and user_id = v_uid) then
    raise exception 'you already joined this challenge';
  end if;
  select count(*) into v_n from public.challenge_entries where challenge_id = c.id;
  if c.max_players is not null and v_n >= c.max_players then raise exception 'this challenge is full'; end if;
  perform 1 from public.validate_challenge_picks(c.id, p_picks);

  perform 1 from public.profiles where id = v_uid for update;
  insert into public.challenge_entries (challenge_id, user_id) values (c.id, v_uid) returning id into v_entry;
  insert into public.challenge_picks (entry_id, match_id, home, away, btts, over25, ht)
    select v_entry, v.match_id, v.home, v.away, v.btts, v.over25, v.ht from public.validate_challenge_picks(c.id, p_picks) v;
  insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference, created_by)
  values (v_uid, -c.stake_units, 'entry_fee', c.id, 'Challenge ' || c.code || ' stake', v_uid);

  select username into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, kind, title, body, link)
  values (c.creator_id, 'challenge_join', '👥 ' || v_name || ' joined “' || c.title || '”',
          (v_n + 1) || ' players · pot ' || public.fmt_units(c.stake_units * (v_n + 1)) || ' Units ('
          || public.fmt_etb(c.stake_units * (v_n + 1)) || ' ETB).', '/challenges/' || c.code);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke execute on function public.join_challenge(text, jsonb) from public, anon;
grant  execute on function public.join_challenge(text, jsonb) to authenticated;

create or replace function public.update_challenge_picks(p_code text, p_picks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  c       public.challenges;
  v_entry bigint;
begin
  select * into c from public.challenges where code = upper(trim(p_code));
  if c.id is null then raise exception 'challenge not found'; end if;
  if c.status <> 'open' or c.lock_at <= now() then raise exception 'this challenge is closed'; end if;
  select id into v_entry from public.challenge_entries where challenge_id = c.id and user_id = auth.uid();
  if v_entry is null then raise exception 'you are not in this challenge'; end if;
  perform 1 from public.validate_challenge_picks(c.id, p_picks);
  delete from public.challenge_picks where entry_id = v_entry;
  insert into public.challenge_picks (entry_id, match_id, home, away, btts, over25, ht)
    select v_entry, v.match_id, v.home, v.away, v.btts, v.over25, v.ht from public.validate_challenge_picks(c.id, p_picks) v;
end $$;
revoke execute on function public.update_challenge_picks(text, jsonb) from public, anon;
grant  execute on function public.update_challenge_picks(text, jsonb) to authenticated;

-- ---------------------------------------------------------- 5. settle
-- Same as 0039 (solo refund kept); scoring now adds the extra-pick points.
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

  insert into public.notifications (user_id, kind, title, body, link)
  select e.user_id, 'challenge_result', '📊 Challenge “' || c.title || '” finished',
         'You finished #' || e.rank || ' of ' || v_players || ' with ' || public.fmt_units(e.points) || ' points. Better luck next time!',
         '/challenges/' || c.code
    from public.challenge_entries e where e.challenge_id = c.id and e.rank > 1;

  update public.challenges set status = 'settled', settled_at = now(), prize_units = v_each * v_winners where id = c.id;
  return 'settled';
end $$;
revoke execute on function public.settle_challenge_if_due(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------- 6. reading
-- Same as 0021, plus: the challenge's extra picks, half-time scores and
-- every player's extra-pick answers (others' only after the first kickoff).
create or replace function public.get_challenge(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c        public.challenges;
  v_uid    uuid := auth.uid();
  v_member boolean;
  v_locked boolean;
  v_out    jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into c from public.challenges where code = upper(trim(p_code));
  if c.id is null then return null; end if;
  perform public.settle_challenge_if_due(c.id);
  select * into c from public.challenges where id = c.id;

  v_member := exists (select 1 from public.challenge_entries where challenge_id = c.id and user_id = v_uid);
  v_locked := c.lock_at <= now() or c.status <> 'open';

  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'title', c.title, 'stake_units', c.stake_units,
    'max_players', c.max_players, 'fee_pct', c.fee_pct, 'status', c.status,
    'lock_at', c.lock_at, 'prize_units', c.prize_units, 'created_at', c.created_at,
    'props', to_jsonb(coalesce(c.props, '{}')),
    'creator', (select username from public.profiles where id = c.creator_id),
    'is_creator', c.creator_id = v_uid,
    'is_member', v_member,
    'locked', v_locked,
    'players', (select count(*) from public.challenge_entries where challenge_id = c.id),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'home_team', m.home_team, 'away_team', m.away_team,
               'home_crest', m.home_crest, 'away_crest', m.away_crest,
               'competition', m.competition, 'kickoff_at', m.kickoff_at, 'status', m.status,
               'home_score', m.actual_home_score, 'away_score', m.actual_away_score,
               'ht_home_score', m.ht_home_score, 'ht_away_score', m.ht_away_score)
             order by m.kickoff_at, m.id)
        from public.challenge_matches cm join public.matches m on m.id = cm.match_id
       where cm.challenge_id = c.id), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'username', p.username, 'is_me', e.user_id = v_uid, 'joined_at', e.joined_at,
               'points', coalesce(e.points, live.pts), 'rank', e.rank, 'payout_units', e.payout_units,
               'picks', case when v_locked or e.user_id = v_uid then (
                   select jsonb_agg(jsonb_build_object(
                            'match_id', cp.match_id, 'home', cp.home, 'away', cp.away,
                            'btts', cp.btts, 'over25', cp.over25, 'ht', cp.ht,
                            'points', coalesce(cp.points, case when m2.status = 'finished'
                              then public.calc_points(cp.home, cp.away, m2.actual_home_score, m2.actual_away_score)
                                 + public.calc_prop_points(cp.btts, cp.over25, cp.ht, m2.actual_home_score, m2.actual_away_score, m2.ht_home_score, m2.ht_away_score) end),
                            'prop_points', coalesce(cp.prop_points, case when m2.status = 'finished'
                              then public.calc_prop_points(cp.btts, cp.over25, cp.ht, m2.actual_home_score, m2.actual_away_score, m2.ht_home_score, m2.ht_away_score) end)))
                     from public.challenge_picks cp join public.matches m2 on m2.id = cp.match_id
                    where cp.entry_id = e.id) end)
             order by coalesce(e.points, live.pts) desc nulls last, e.joined_at)
        from public.challenge_entries e
        join public.profiles p on p.id = e.user_id
        left join lateral (
          select sum(public.calc_points(cp.home, cp.away, m3.actual_home_score, m3.actual_away_score)
                   + public.calc_prop_points(cp.btts, cp.over25, cp.ht, m3.actual_home_score, m3.actual_away_score, m3.ht_home_score, m3.ht_away_score)) pts
            from public.challenge_picks cp join public.matches m3 on m3.id = cp.match_id
           where cp.entry_id = e.id and m3.status = 'finished' and v_locked
        ) live on true
       where e.challenge_id = c.id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.get_challenge(text) from public, anon;
grant  execute on function public.get_challenge(text) to authenticated;

-- PostgREST: pick up the new create_challenge signature right away.
notify pgrst, 'reload schema';
