-- =====================================================================
-- 0031: Gebeta Premium (paid from the wallet)
--   Monthly 2 Units (400 ETB) or yearly 20 Units (4,000 ETB).
--   Payment is a wallet ledger row of kind 'subscription'; renewals are
--   charged by the match sync (auto-renew, can be turned off). No money,
--   no Premium: it simply runs out.
--   Premium shows:
--     * crowd stats for a daily round while it's open: anonymous % per
--       result and the most picked score, only once 5+ slips are in, so
--       nobody's own picks can be read off them;
--     * any player's full slip from the leaderboard, only after the round
--       locks. Before the lock picks stay secret for everyone.
--   Private challenges are not touched: their picks stay hidden.
-- Safe to re-run.
-- =====================================================================

-- 1) Ledger: new kind
alter table public.wallet_ledger drop constraint if exists wallet_ledger_kind_check;
alter table public.wallet_ledger add constraint wallet_ledger_kind_check
  check (kind in ('deposit', 'withdrawal', 'entry_fee', 'payout', 'refund', 'adjustment', 'subscription'));

-- 2) One row per player: their current plan
create table if not exists public.subscriptions (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  plan               text not null check (plan in ('monthly', 'yearly')),
  auto_renew         boolean not null default true,
  started_at         timestamptz not null default now(),
  current_period_end timestamptz not null,
  updated_at         timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions for select to authenticated using (user_id = auth.uid());

create or replace function public.premium_price(p_plan text) returns numeric
language sql immutable as $$ select case p_plan when 'monthly' then 2::numeric when 'yearly' then 20::numeric end $$;

create or replace function public.premium_length(p_plan text) returns interval
language sql immutable as $$ select case p_plan when 'monthly' then interval '30 days' when 'yearly' then interval '365 days' end $$;

create or replace function public.is_premium(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions where user_id = p_user_id and current_period_end > now());
$$;
revoke execute on function public.is_premium(uuid) from public, anon, authenticated;

-- 3) Buying (or extending) Premium. Paying early adds the time on top.
create or replace function public.buy_premium(p_plan text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_price numeric := public.premium_price(p_plan);
  v_sub   public.subscriptions;
  v_from  timestamptz;
  v_end   timestamptz;
begin
  if v_uid is null then raise exception 'not logged in'; end if;
  if v_price is null then raise exception 'unknown plan'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  select * into v_sub from public.subscriptions where user_id = v_uid;
  v_from := greatest(now(), coalesce(v_sub.current_period_end, now()));
  v_end  := v_from + public.premium_length(p_plan);
  -- the ledger refuses it if the wallet can't cover it ("insufficient balance")
  begin
    insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
    values (v_uid, -v_price, 'subscription', 'Gebeta Premium ' || p_plan || ' until ' || to_char(v_end at time zone 'Africa/Addis_Ababa', 'DD Mon YYYY'), v_uid);
  exception when check_violation then raise exception 'insufficient balance';
  end;
  insert into public.subscriptions (user_id, plan, auto_renew, started_at, current_period_end)
  values (v_uid, p_plan, true, now(), v_end)
  on conflict (user_id) do update
    set plan = excluded.plan, auto_renew = true, current_period_end = excluded.current_period_end, updated_at = now(),
        started_at = case when public.subscriptions.current_period_end > now() then public.subscriptions.started_at else now() end;
  return v_end;
end $$;
revoke execute on function public.buy_premium(text) from public, anon;
grant  execute on function public.buy_premium(text) to authenticated;

create or replace function public.set_premium_auto_renew(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update public.subscriptions set auto_renew = p_on, updated_at = now() where user_id = auth.uid();
$$;
revoke execute on function public.set_premium_auto_renew(boolean) from public, anon;
grant  execute on function public.set_premium_auto_renew(boolean) to authenticated;

-- 4) Renewals (run by the match sync with the server key). Returns how many renewed.
create or replace function public.renew_due_subscriptions() returns int
language plpgsql security definer set search_path = public as $$
declare
  s     public.subscriptions;
  v_n   int := 0;
  v_end timestamptz;
  v_price numeric;
begin
  for s in select * from public.subscriptions
            where auto_renew and current_period_end <= now() and current_period_end > now() - interval '3 days'
            for update skip locked
  loop
    v_price := public.premium_price(s.plan);
    v_end := s.current_period_end + public.premium_length(s.plan);
    begin
      insert into public.wallet_ledger (user_id, amount_units, kind, reference)
      values (s.user_id, -v_price, 'subscription', 'Gebeta Premium ' || s.plan || ' renewal until ' || to_char(v_end at time zone 'Africa/Addis_Ababa', 'DD Mon YYYY'));
      update public.subscriptions set current_period_end = v_end, updated_at = now() where user_id = s.user_id;
      insert into public.notifications (user_id, kind, title, body, link)
      values (s.user_id, 'premium', '⭐ Premium renewed',
              'Your Gebeta Premium was renewed until ' || to_char(v_end at time zone 'Africa/Addis_Ababa', 'DD Mon YYYY') || '. You can turn off auto-renew on the Premium page.', '/premium');
      v_n := v_n + 1;
    exception when others then
      -- not enough Units (or betting paused): Premium ends, no debt
      update public.subscriptions set auto_renew = false, updated_at = now() where user_id = s.user_id;
      insert into public.notifications (user_id, kind, title, body, link)
      values (s.user_id, 'premium', 'Premium ended',
              'We could not renew Gebeta Premium (not enough Units in your wallet). Top up and renew on the Premium page any time.', '/premium');
    end;
  end loop;
  return v_n;
end $$;
revoke execute on function public.renew_due_subscriptions() from public, anon, authenticated;
grant  execute on function public.renew_due_subscriptions() to service_role;

-- 5) Responsible play: buying Premium needs 18+ and no active break, like a bet.
create or replace function public.guard_bet_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if new.kind not in ('entry_fee', 'deposit', 'subscription') then return new; end if;
  select * into p from public.profiles where id = new.user_id;
  if p.date_of_birth is null then
    raise exception 'the player must add their date of birth (18+) first';
  end if;
  if not public.is_adult(p.date_of_birth) then
    raise exception 'you must be 18 or older to play';
  end if;
  if new.kind in ('entry_fee', 'subscription') and p.excluded_until is not null and p.excluded_until > now() then
    raise exception 'betting paused: you are taking a break until %', to_char(p.excluded_until at time zone 'Africa/Addis_Ababa', 'DD Mon YYYY HH24:MI');
  end if;
  return new;
end $$;
revoke execute on function public.guard_bet_payment() from public, anon, authenticated;

-- 6) Premium: crowd picks for a daily round (anonymous, 5+ slips). Works before the lock.
create or replace function public.get_round_crowd(p_round_id bigint)
returns table (match_id bigint, slips bigint, home_pct numeric, draw_pct numeric, away_pct numeric, top_score text, top_score_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_premium(auth.uid()) then raise exception 'premium only'; end if;
  if (select count(*) from public.slips where round_id = p_round_id) < 5 then return; end if;
  return query
  with p as (
    select sp.match_id, sp.home, sp.away
      from public.slip_picks sp join public.slips s on s.id = sp.slip_id
     where s.round_id = p_round_id
  ), t as (
    select p.match_id, count(*) n,
           count(*) filter (where p.home > p.away) h, count(*) filter (where p.home = p.away) d, count(*) filter (where p.home < p.away) a
      from p group by p.match_id
  ), sc as (
    select distinct on (p.match_id) p.match_id, p.home || '-' || p.away as score, count(*) c
      from p group by p.match_id, p.home, p.away
     order by p.match_id, count(*) desc, p.home || '-' || p.away
  )
  select t.match_id, t.n, round(100.0 * t.h / t.n), round(100.0 * t.d / t.n), round(100.0 * t.a / t.n), sc.score, round(100.0 * sc.c / t.n)
    from t join sc on sc.match_id = t.match_id;
end $$;
revoke execute on function public.get_round_crowd(bigint) from public, anon;
grant  execute on function public.get_round_crowd(bigint) to authenticated;

-- 7) Premium: one player's full slip from the leaderboard, only after the round locks.
--    Your own slip is always visible.
create or replace function public.get_slip_detail(p_slip_id bigint)
returns table (username text, slip_no int, round_id bigint, round_name text, match_id bigint, home_team text, away_team text,
               kickoff_at timestamptz, status text, actual_home smallint, actual_away smallint, home smallint, away smallint, points numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_slip public.slips;
begin
  select * into v_slip from public.slips where id = p_slip_id;
  if v_slip.id is null then raise exception 'slip not found'; end if;
  if v_slip.user_id <> auth.uid() then
    if not public.is_premium(auth.uid()) then raise exception 'premium only'; end if;
    if coalesce(public.round_lock_at(v_slip.round_id) > now(), true)
       and (select r2.status from public.rounds r2 where r2.id = v_slip.round_id) = 'open' then
      raise exception 'picks are secret until the round locks';
    end if;
  end if;
  return query
  select pr.username, v_slip.slip_no, r.id, r.name, m.id, m.home_team, m.away_team, m.kickoff_at, m.status,
         m.actual_home_score, m.actual_away_score, sp.home, sp.away,
         coalesce(sp.points_earned, case when m.status = 'finished' then public.calc_points(sp.home, sp.away, m.actual_home_score, m.actual_away_score) end)
    from public.rounds r
    join public.profiles pr on pr.id = v_slip.user_id
    join public.matches m on m.round_id = r.id
    left join public.slip_picks sp on sp.slip_id = v_slip.id and sp.match_id = m.id
   where r.id = v_slip.round_id
   order by m.kickoff_at, m.id;
end $$;
revoke execute on function public.get_slip_detail(bigint) from public, anon;
grant  execute on function public.get_slip_detail(bigint) to authenticated;
