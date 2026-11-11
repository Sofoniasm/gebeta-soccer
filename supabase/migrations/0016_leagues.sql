-- =====================================================================
-- GebetaSoccer — Private Leagues (invite-only pools)
--   * Any verified player creates a league on an open round: free, or
--     paid (5–50 Units = 1,000–10,000 ETB per player).
--   * Friends join with the invite code / link:
--       free  → in straight away
--       paid  → pay from wallet now, or "request to join" and pay the
--               admin on Telegram; the admin approves (deducting from the
--               wallet, or adding the received units and deducting).
--   * The league uses the round's matches and the players' normal picks,
--     with its own leaderboard. Paid leagues: winner(s) get 70% of the
--     league pot, 30% house — paid when the admin settles.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists public.leagues (
  id               bigint generated always as identity primary key,
  code             text not null unique,
  name             text not null check (char_length(trim(name)) between 3 and 40),
  captain_id       uuid not null references public.profiles (id) on delete cascade,
  round_id         bigint not null references public.rounds (id),
  entry_fee_units  numeric(12,2) not null default 0
                   check (entry_fee_units = 0 or entry_fee_units between 5 and 50),
  house_cut        numeric(4,3) not null default 0.30,
  status           text not null default 'open' check (status in ('open', 'settled', 'cancelled')),
  created_at       timestamptz not null default now(),
  settled_at       timestamptz
);
create index if not exists leagues_round_idx on public.leagues (round_id);

create table if not exists public.league_members (
  league_id     bigint not null references public.leagues (id) on delete cascade,
  user_id       uuid   not null references public.profiles (id) on delete cascade,
  status        text   not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  requested_at  timestamptz not null default now(),
  joined_at     timestamptz,
  approved_by   uuid references auth.users (id),
  primary key (league_id, user_id)
);
create index if not exists league_members_user_idx on public.league_members (user_id);

alter table public.wallet_ledger add column if not exists league_id bigint references public.leagues (id);

-- ---------------------------------------------------------------- RLS
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

create or replace function public.is_league_member(p_league_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.league_members
                  where league_id = p_league_id and user_id = auth.uid() and status = 'active');
$$;

drop policy if exists "players read leagues" on public.leagues;
create policy "players read leagues" on public.leagues for select to authenticated using (true);
drop policy if exists "read league members" on public.league_members;
create policy "read league members" on public.league_members for select to authenticated
  using (user_id = auth.uid() or public.is_league_member(league_id)
         or exists (select 1 from public.leagues l where l.id = league_id and l.captain_id = auth.uid()));
revoke insert, update, delete on public.leagues, public.league_members from anon, authenticated;

-- Players in an active league on a round may predict that round too.
create or replace function public.can_predict_round(p_round_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.round_entries where round_id = p_round_id and user_id = auth.uid())
      or exists (select 1 from public.league_members lm join public.leagues l on l.id = lm.league_id
                  where l.round_id = p_round_id and lm.user_id = auth.uid() and lm.status = 'active');
$$;

drop policy if exists "insert own prediction before kickoff" on public.predictions;
create policy "insert own prediction before kickoff" on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m join public.rounds r on r.id = m.round_id
       where m.id = match_id and r.status = 'open' and m.status = 'scheduled' and m.kickoff_at > now()
         and public.can_predict_round(r.id)
    )
  );

-- ---------------------------------------------------------------- pot
create or replace function public.get_league_pool(p_league_id bigint)
returns table (members bigint, pending bigint, pool_units numeric, prize_fund_units numeric)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where m.status = 'active'),
         count(*) filter (where m.status = 'pending'),
         count(*) filter (where m.status = 'active') * l.entry_fee_units,
         round(count(*) filter (where m.status = 'active') * l.entry_fee_units * (1 - l.house_cut), 2)
    from public.leagues l
    left join public.league_members m on m.league_id = l.id
   where l.id = p_league_id
   group by l.id;
$$;
grant execute on function public.get_league_pool(bigint) to authenticated;

-- ------------------------------------------------------- notify admins
create or replace function public.notify_admins(p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select id, 'admin', p_title, p_body, p_link from public.profiles where is_admin;
$$;
revoke execute on function public.notify_admins(text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------ pay the fee
create or replace function public.pay_league_fee(p_league_id bigint, p_user_id uuid, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l public.leagues;
begin
  select * into l from public.leagues where id = p_league_id;
  if l.entry_fee_units > 0 then
    insert into public.wallet_ledger (user_id, amount_units, kind, round_id, league_id, reference, created_by)
    values (p_user_id, -l.entry_fee_units, 'entry_fee', l.round_id, l.id, 'League entry · ' || l.name, p_by);
  end if;
  insert into public.league_members (league_id, user_id, status, joined_at, approved_by)
  values (p_league_id, p_user_id, 'active', now(), p_by)
  on conflict (league_id, user_id) do update
    set status = 'active', joined_at = now(), approved_by = excluded.approved_by;
end $$;
revoke execute on function public.pay_league_fee(bigint, uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------- create
create or replace function public.create_league(p_name text, p_round_id bigint, p_fee numeric, p_pay boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_id   bigint;
  v_bal  numeric;
  i int := 0;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  if not exists (select 1 from public.rounds where id = p_round_id and status = 'open') then
    raise exception 'round is not open';
  end if;
  if p_fee is null or not (p_fee = 0 or p_fee between 5 and 50) then
    raise exception 'entry fee must be 0 (free) or 5-50 units';
  end if;
  if (select count(*) from public.leagues where captain_id = v_uid and status = 'open') >= 5 then
    raise exception 'you can run at most 5 open leagues';
  end if;

  loop
    -- 4 characters from an alphabet without look-alikes (no 0/O, 1/I/L)
    select 'GEBETA-' || string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
      into v_code from generate_series(1, 4);
    exit when not exists (select 1 from public.leagues where code = v_code);
    i := i + 1;
    if i > 20 then raise exception 'could not make a code, try again'; end if;
  end loop;

  insert into public.leagues (code, name, captain_id, round_id, entry_fee_units)
  values (v_code, trim(p_name), v_uid, p_round_id, p_fee) returning id into v_id;

  -- The captain joins their own league (pays now if paid & affordable).
  select balance_units into v_bal from public.profiles where id = v_uid;
  if p_fee = 0 or (p_pay and v_bal >= p_fee) then
    perform public.pay_league_fee(v_id, v_uid, v_uid);
  else
    insert into public.league_members (league_id, user_id, status) values (v_id, v_uid, 'pending');
    perform public.notify_admins('🔔 League payment pending',
      (select username from public.profiles where id = v_uid) || ' created “' || trim(p_name) || '” and owes '
      || public.fmt_units(p_fee) || ' Units (' || public.fmt_etb(p_fee) || ' ETB).', '/admin/leagues');
  end if;
  return v_code;
end $$;
revoke execute on function public.create_league(text, bigint, numeric, boolean) from public, anon;
grant  execute on function public.create_league(text, bigint, numeric, boolean) to authenticated;

-- ------------------------------------------------------- join
-- p_pay = true: pay from wallet now. false: request (pay the admin on Telegram).
create or replace function public.join_league(p_code text, p_pay boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  l     public.leagues;
  v_st  text;
  v_bal numeric;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  select * into l from public.leagues where code = upper(trim(p_code));
  if l.id is null then raise exception 'league not found'; end if;
  if l.status <> 'open' or not exists (select 1 from public.rounds where id = l.round_id and status = 'open') then
    raise exception 'league is closed';
  end if;

  select status into v_st from public.league_members where league_id = l.id and user_id = v_uid;
  if v_st = 'active' then return 'active'; end if;

  if l.entry_fee_units = 0 then
    perform public.pay_league_fee(l.id, v_uid, v_uid);
    return 'active';
  end if;

  if p_pay then
    select balance_units into v_bal from public.profiles where id = v_uid for update;
    if v_bal < l.entry_fee_units then raise exception 'insufficient balance'; end if;
    perform public.pay_league_fee(l.id, v_uid, v_uid);
    return 'active';
  end if;

  if v_st is null or v_st = 'rejected' then
    insert into public.league_members (league_id, user_id, status) values (l.id, v_uid, 'pending')
    on conflict (league_id, user_id) do update set status = 'pending', requested_at = now();
    perform public.notify_admins('🔔 League join request',
      (select username from public.profiles where id = v_uid) || ' wants to join “' || l.name || '” and owes '
      || public.fmt_units(l.entry_fee_units) || ' Units (' || public.fmt_etb(l.entry_fee_units) || ' ETB).', '/admin/leagues');
  end if;
  return 'pending';
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke execute on function public.join_league(text, boolean) from public, anon;
grant  execute on function public.join_league(text, boolean) to authenticated;

-- ------------------------------------------------------- admin
-- p_add_units: the admin received the ETB on Telegram → credit it first.
create or replace function public.admin_approve_league_member(p_league_id bigint, p_user_id uuid, p_add_units boolean, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l public.leagues;
begin
  select * into l from public.leagues where id = p_league_id for update;
  if l.id is null or l.status <> 'open' then raise exception 'league is not open'; end if;
  if not exists (select 1 from public.league_members where league_id = p_league_id and user_id = p_user_id and status = 'pending') then
    raise exception 'no pending request';
  end if;
  if p_add_units and l.entry_fee_units > 0 then
    insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
    values (p_user_id, l.entry_fee_units, 'deposit', 'Telegram deposit · League ' || l.name, p_admin_id);
  end if;
  perform public.pay_league_fee(p_league_id, p_user_id, p_admin_id);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;

create or replace function public.admin_reject_league_member(p_league_id bigint, p_user_id uuid, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.league_members set status = 'rejected', approved_by = p_admin_id
   where league_id = p_league_id and user_id = p_user_id and status = 'pending';
  if not found then raise exception 'no pending request'; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user_id, 'league', '❌ League request declined',
         'Your request to join “' || name || '” was not approved. Message the admin on Telegram if this is a mistake.', '/leagues'
    from public.leagues where id = p_league_id;
end $$;

-- Pay the league's winners (computed by the server with the same scoring).
-- p_payouts: [{ "user_id": "...", "units": 12.5, "rank": 1 }]
create or replace function public.settle_league(p_league_id bigint, p_payouts jsonb, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  l      public.leagues;
  v_fund numeric;
  v_paid numeric;
begin
  select * into l from public.leagues where id = p_league_id for update;
  if l.id is null then raise exception 'league not found'; end if;
  if l.status <> 'open' then raise exception 'league already %', l.status; end if;
  if exists (select 1 from public.matches where round_id = l.round_id
              and status not in ('finished', 'cancelled', 'postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select prize_fund_units into v_fund from public.get_league_pool(p_league_id);
  select coalesce(sum((x ->> 'units')::numeric), 0) into v_paid from jsonb_array_elements(p_payouts) x;
  if v_paid > coalesce(v_fund, 0) + 0.001 then
    raise exception 'payouts (%) exceed prize fund (%)', v_paid, v_fund;
  end if;
  if exists (select 1 from jsonb_array_elements(p_payouts) x
              where not exists (select 1 from public.league_members m
                                 where m.league_id = p_league_id and m.status = 'active'
                                   and m.user_id = (x ->> 'user_id')::uuid)) then
    raise exception 'payout to a non-member';
  end if;

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, league_id, reference, created_by)
  select (x ->> 'user_id')::uuid, (x ->> 'units')::numeric, 'payout', l.round_id, l.id,
         'League ' || l.name || ' winnings (Rank ' || coalesce(x ->> 'rank', '1') || ')', p_admin_id
    from jsonb_array_elements(p_payouts) x
   where (x ->> 'units')::numeric > 0;

  update public.league_members set status = 'rejected' where league_id = p_league_id and status = 'pending';
  update public.leagues set status = 'settled', settled_at = now() where id = p_league_id;
end $$;

revoke execute on function public.admin_approve_league_member(bigint, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.admin_reject_league_member(bigint, uuid, uuid)            from public, anon, authenticated;
revoke execute on function public.settle_league(bigint, jsonb, uuid)                         from public, anon, authenticated;
grant  execute on function public.admin_approve_league_member(bigint, uuid, boolean, uuid) to service_role;
grant  execute on function public.admin_reject_league_member(bigint, uuid, uuid)            to service_role;
grant  execute on function public.settle_league(bigint, jsonb, uuid)                         to service_role;
grant  execute on function public.notify_admins(text, text, text)                            to service_role;

-- ------------------------------------------------ league leaderboard
create or replace function public.get_league_leaderboard(p_league_id bigint)
returns table (rank bigint, username text, points numeric, slam_points numeric, correct_results bigint,
               exact_scores bigint, close_picks bigint, predicted bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with l as (
    select * from public.leagues
     where id = p_league_id
       and (auth.uid() is null or public.is_league_member(p_league_id) or captain_id = auth.uid())
  ),
  e as (select m.user_id from public.league_members m join l on l.id = m.league_id where m.status = 'active'),
  picks as (
    select e.user_id, mt.status, p.id as pid, p.points_earned,
           p.predicted_home_score ph, p.predicted_away_score pa,
           mt.actual_home_score ah, mt.actual_away_score aa
      from e
      cross join l
      join public.matches mt on mt.round_id = l.round_id
      left join public.predictions p on p.user_id = e.user_id and p.match_id = mt.id
  ),
  s as (
    select user_id,
           coalesce(sum(coalesce(points_earned,
                    case when status = 'finished' then public.calc_points(ph, pa, ah, aa) end)), 0) as pts,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) > 0) as correct,
           count(*) filter (where status = 'finished' and ph = ah and pa = aa) as ex,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) = 1.5) as cl,
           coalesce(sum(case when status = 'finished' then coalesce(abs(ph - ah) + abs(pa - aa), 20) end), 0) as away,
           count(pid) as pred
      from picks group by user_id
  )
  select rank() over (order by s.pts + public.slam_points(s.correct) desc, s.correct desc, s.ex desc, s.cl desc, s.away asc),
         pr.username, s.pts + public.slam_points(s.correct), public.slam_points(s.correct),
         s.correct, s.ex, s.cl, s.pred, s.user_id = auth.uid()
    from s join public.profiles pr on pr.id = s.user_id
   order by 1, pr.username;
$$;
grant execute on function public.get_league_leaderboard(bigint) to authenticated, service_role;

-- ------------------------------------------ defaults include leagues
create or replace function public.apply_default_picks(p_round_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  m record;
  v_h smallint;
  v_a smallint;
  n int;
begin
  for m in
    select id from public.matches
     where round_id = p_round_id and kickoff_at <= now()
       and status not in ('postponed', 'cancelled')
  loop
    select predicted_home_score, predicted_away_score into v_h, v_a
      from public.predictions
     where match_id = m.id and not is_default
     group by predicted_home_score, predicted_away_score
     order by count(*) desc, predicted_home_score + predicted_away_score asc,
              predicted_home_score - predicted_away_score desc
     limit 1;
    if v_h is null then v_h := 1; v_a := 0; end if;

    insert into public.predictions (user_id, match_id, predicted_home_score, predicted_away_score, is_default)
    select u.user_id, m.id, v_h, v_a, true
      from (select e.user_id from public.round_entries e where e.round_id = p_round_id
            union
            select lm.user_id from public.league_members lm join public.leagues l on l.id = lm.league_id
             where l.round_id = p_round_id and lm.status = 'active') u
     where not exists (select 1 from public.predictions p where p.user_id = u.user_id and p.match_id = m.id);
    get diagnostics n = row_count;
    v_count := v_count + n;
    v_h := null; v_a := null;
  end loop;
  return v_count;
end $$;

-- ----------------------------------- wallet notes name the league
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
begin
  select balance_units into v_bal from public.profiles where id = new.user_id;
  if new.league_id is not null then
    select 'league “' || name || '”' into v_round from public.leagues where id = new.league_id;
  else
    select coalesce(nullif(trim(name), ''), 'Round ' || id) into v_round from public.rounds where id = new.round_id;
  end if;

  if new.kind = 'deposit' then
    v_title := '💰 Deposit received';
    v_body  := '+' || v_amt || ' added to your wallet.';
  elsif new.kind = 'payout' then
    v_title := '🏆 You won!';
    v_body  := '+' || v_amt || ' from ' || coalesce(v_round, 'your round') || '. Congratulations!';
    v_link  := case when new.league_id is not null then '/leagues' else '/results' end;
  elsif new.kind = 'refund' and new.reference like 'Withdrawal #% rejected' then
    v_title := '❌ ' || replace(new.reference, ' rejected', ' not sent');
    v_body  := '+' || v_amt || ' returned to your wallet.';
  elsif new.kind = 'refund' then
    v_title := '↩️ Units returned';
    v_body  := '+' || v_amt || ' back in your wallet' || coalesce(' — ' || new.reference, '') || '.';
  elsif new.kind = 'adjustment' then
    v_title := case when new.amount_units > 0 then '➕ Units added' else '➖ Units deducted' end;
    v_body  := case when new.amount_units > 0 then '+' else '−' end || v_amt ||
               coalesce(' — ' || new.reference, '') || '.';
  elsif new.kind = 'entry_fee' then
    v_title := '⚽ You joined ' || coalesce(v_round, 'the round');
    v_body  := v_amt || ' entry fee paid. Good luck with your predictions!';
    v_link  := case when new.league_id is not null then '/leagues' else '/dashboard' end;
    -- self-joins are quiet; admin approvals are sent to Telegram
    v_push  := new.created_by is distinct from new.user_id;
  elsif new.kind = 'withdrawal' then
    v_title := '⏳ Withdrawal requested';
    v_body  := v_amt || ' is on hold for you. We''ll send it to your Telebirr soon.';
    v_push  := false;
  else
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, push)
  values (new.user_id, new.kind, v_title,
          v_body || ' Balance: ' || public.fmt_units(coalesce(v_bal, 0)) || ' Units.', v_link, v_push);
  return new;
end $$;

-- Members list (names only) — for league members and the captain
create or replace function public.get_league_members(p_league_id bigint)
returns table (username text, status text, is_captain boolean, is_me boolean, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select pr.username, m.status, pr.id = l.captain_id, pr.id = auth.uid(), coalesce(m.joined_at, m.requested_at)
    from public.leagues l
    join public.league_members m on m.league_id = l.id
    join public.profiles pr on pr.id = m.user_id
   where l.id = p_league_id
     and m.status in ('active', 'pending')
     and (public.is_league_member(l.id) or l.captain_id = auth.uid())
   order by (m.status = 'active') desc, coalesce(m.joined_at, m.requested_at);
$$;
grant execute on function public.get_league_members(bigint) to authenticated;
