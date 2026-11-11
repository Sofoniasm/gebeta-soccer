-- =====================================================================
-- GebetaSoccer database security tests. Every block FAILS the run (raises)
-- if an attack succeeds or a rule is broken. Run after all migrations.
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

-- ---------- structure ------------------------------------------------
do $$
declare t text;
begin
  select string_agg(c.relname, ', ') into t from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if t is not null then raise exception 'FAIL: RLS is OFF on: %', t; end if;

  select string_agg(table_name || ':' || grantee || ':' || privilege_type, ', ') into t
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT';
  if t is not null then raise exception 'FAIL: browsers have table write rights: %', t; end if;

  select string_agg(table_name || '.' || column_name || ':' || grantee || ':' || privilege_type, ', ') into t
    from information_schema.column_privileges
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE')
     and (table_name, column_name) not in (('profiles', 'username'));
  if t is not null then raise exception 'FAIL: unexpected column write rights: %', t; end if;

  select string_agg(p.proname, ', ') into t from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('get_match_pick_count', 'get_overall_leaderboard', 'get_public_stats',
                           'get_round_leaderboard', 'get_round_pool', 'round_lock_at', 'round_is_bettable');
  if t is not null then raise exception 'FAIL: logged-out visitors can run privileged functions: %', t; end if;

  select string_agg(p.proname, ', ') into t from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'admin\_%' and has_function_privilege('authenticated', p.oid, 'execute');
  if t is not null then raise exception 'FAIL: players can run admin functions: %', t; end if;
  raise notice 'ok  structure: RLS on every table, no stray write rights, admin functions locked';
end $$;

-- ---------- test data ------------------------------------------------
insert into auth.users (id, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000001', '{"username":"alice","phone_number":"+251911000001"}'),
  ('11111111-0000-0000-0000-000000000002', '{"username":"bob","phone_number":"+251911000002"}'),
  ('11111111-0000-0000-0000-000000000003', '{"username":"mallory","phone_number":"+251911000003"}');
update public.profiles set phone_verified_at = now();
insert into public.rounds (name, status) values ('Test week', 'draft');
insert into public.matches (round_id, home_team, away_team, kickoff_at) values
  ((select max(id) from public.rounds), 'Home FC', 'Away FC', now() + interval '1 day'),
  ((select max(id) from public.rounds), 'Late FC', 'Night FC', now() + interval '1 day 2 hours');
insert into public.matches (round_id, home_team, away_team, kickoff_at)
  select (select max(id) from public.rounds), 'Team ' || g, 'Other ' || g, now() + interval '2 days'
    from generate_series(3, 10) g;

-- every round has exactly 10 matches
do $$ begin
  begin insert into public.rounds (name, status) values ('Sneaky', 'open');
        raise exception 'FAIL: a round opened without 10 matches';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin insert into public.matches (round_id, home_team, away_team, kickoff_at)
        values ((select max(id) from public.rounds), 'Eleventh', 'Match', now() + interval '2 days');
        raise exception 'FAIL: an 11th match was added to a round';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  rounds hold exactly 10 matches';
end $$;
update public.rounds set status = 'open' where id = (select max(id) from public.rounds);
create table tests_slip as
  select jsonb_agg(jsonb_build_object('match_id', id, 'home', 1, 'away', 0)) j from public.matches where round_id = (select max(id) from public.rounds);
create table tests_slip9 as
  select jsonb_agg(jsonb_build_object('match_id', id, 'home', 1, 'away', 0)) j
    from (select id from public.matches where round_id = (select max(id) from public.rounds) limit 9) x;
grant select on tests_slip, tests_slip9 to anon, authenticated;
select public.admin_add_units('11111111-0000-0000-0000-000000000001', 10, 'test', null);
select public.admin_add_units('11111111-0000-0000-0000-000000000002', 10, 'test', null);

-- deposit limits
do $$ begin
  begin perform public.admin_add_units('11111111-0000-0000-0000-000000000001', 4, 'x', null);
        raise exception 'FAIL: deposit below 1,000 ETB accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.admin_add_units('11111111-0000-0000-0000-000000000001', 51, 'x', null);
        raise exception 'FAIL: deposit above 10,000 ETB accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  deposits limited to 1,000-10,000 ETB';
end $$;

-- the ledger can't be edited, even by the owner role
do $$ begin
  begin update public.wallet_ledger set amount_units = 999;
        raise exception 'FAIL: ledger rows can be edited';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  wallet ledger is append-only';
end $$;

-- ---------- attacks by a logged-out visitor -----------------------------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
do $$ begin
  begin insert into public.wallet_ledger (user_id, amount_units, kind) values ('11111111-0000-0000-0000-000000000003', 100, 'deposit');
        raise exception 'FAIL: anon wrote to wallet'; exception when insufficient_privilege then null; end;
  begin perform public.check_signup_available('x', '+251911000001');
        raise exception 'FAIL: anon can test which phones are registered'; exception when insufficient_privilege then null; end;
  begin perform * from public.get_league_leaderboard(1);
        raise exception 'FAIL: anon can read league tables'; exception when insufficient_privilege then null; end;
  if exists (select 1 from public.profiles) then raise exception 'FAIL: anon can read profiles'; end if;
  if exists (select 1 from public.wallet_ledger) then raise exception 'FAIL: anon can read wallets'; end if;
  raise notice 'ok  logged-out visitor blocked';
end $$;
reset role;

-- ---------- attacks by a logged-in player (mallory) ---------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false) \g /dev/null
do $$ begin
  begin update public.profiles set balance_units = 9999 where id = auth.uid();
        raise exception 'FAIL: player changed own balance'; exception when insufficient_privilege then null; end;
  begin update public.profiles set is_admin = true where id = auth.uid();
        raise exception 'FAIL: player made themselves admin'; exception when insufficient_privilege then null; end;
  begin insert into public.wallet_ledger (user_id, amount_units, kind) values (auth.uid(), 100, 'deposit');
        raise exception 'FAIL: player gave themselves money'; exception when insufficient_privilege then null; end;
  begin insert into public.round_entries (round_id, user_id) values ((select max(id) from public.rounds), auth.uid());
        raise exception 'FAIL: player joined a round for free'; exception when insufficient_privilege then null; end;
  begin perform public.place_slip((select max(id) from public.rounds), (select j from tests_slip));
        raise exception 'FAIL: player with 0 units placed a slip';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin insert into public.predictions (user_id, match_id, predicted_home_score, predicted_away_score)
        values (auth.uid(), (select min(id) from public.matches), 1, 0);
        raise exception 'FAIL: player wrote a pick directly'; exception when insufficient_privilege then null; end;
  begin insert into public.slip_picks (slip_id, match_id, home, away) values (1, (select min(id) from public.matches), 1, 0);
        raise exception 'FAIL: player wrote slip picks directly'; exception when insufficient_privilege then null; end;
  begin insert into public.slips (round_id, user_id, slip_no) values ((select max(id) from public.rounds), auth.uid(), 1);
        raise exception 'FAIL: player created a free slip'; exception when insufficient_privilege then null; end;
  begin insert into public.notifications (user_id, kind, title) values (auth.uid(), 'x', 'fake');
        raise exception 'FAIL: player created a notification'; exception when insufficient_privilege then null; end;
  begin perform public.admin_add_units(auth.uid(), 50, 'hack', auth.uid());
        raise exception 'FAIL: player ran admin_add_units'; exception when insufficient_privilege then null; end;
  begin perform public.settle_round(1, '[]', '[]', auth.uid());
        raise exception 'FAIL: player ran settle_round'; exception when insufficient_privilege then null; end;
  begin perform public.settle_round_slips(1, '[]', '[]', '[]', auth.uid());
        raise exception 'FAIL: player ran settle_round_slips'; exception when insufficient_privilege then null; end;
  if exists (select 1 from public.profiles where id <> auth.uid()) then raise exception 'FAIL: player can read other profiles'; end if;
  if exists (select 1 from public.wallet_ledger where user_id <> auth.uid()) then raise exception 'FAIL: player can read other wallets'; end if;
  raise notice 'ok  player can''t give themselves money, admin rights, free entry or fake data';
end $$;
reset role;

-- ---------- slips: legit play, 10-pick rule, hidden picks, lock ---------
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false) \g /dev/null
select public.place_slip((select max(id) from public.rounds), (select j from tests_slip));
select public.place_slip((select max(id) from public.rounds), (select j from tests_slip));
do $$ begin
  if (select count(*) from public.slips where user_id = auth.uid()) <> 2 then raise exception 'FAIL: two paid slips not recorded'; end if;
  begin perform public.place_slip((select max(id) from public.rounds), (select j from tests_slip9));
        raise exception 'FAIL: slip with 9 picks accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin update public.slip_picks set points_earned = 30;
        raise exception 'FAIL: player set their own points'; exception when insufficient_privilege then null; end;
  begin perform public.request_withdrawal(8, '+251911000001');
        raise exception 'FAIL: withdrawal left less than 1 Unit';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  slips need all 10 picks, each slip is paid, no self-scoring, no over-withdrawal';
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false) \g /dev/null
do $$ begin
  if exists (select 1 from public.get_match_picks((select min(id) from public.matches))) then
    raise exception 'FAIL: other players'' picks visible before the round locks';
  end if;
  if exists (select 1 from public.slips where user_id <> auth.uid()) then raise exception 'FAIL: player can see other slips'; end if;
  begin perform public.update_slip((select min(id) from public.slips), (select j from tests_slip));
        raise exception 'FAIL: player edited someone else''s slip';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  other players'' slips are private until the lock';
end $$;
reset role;
update public.matches set kickoff_at = now() - interval '1 minute'
 where id = (select min(id) from public.matches where round_id = (select max(id) from public.rounds));
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false) \g /dev/null
do $$ begin
  begin perform public.place_slip((select max(id) from public.rounds), (select j from tests_slip));
        raise exception 'FAIL: slip placed after the first kickoff';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.update_slip((select min(id) from public.slips where user_id = auth.uid()), (select j from tests_slip));
        raise exception 'FAIL: slip edited after the first kickoff';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  whole round locks at the first kickoff';
end $$;
reset role;
update public.matches set kickoff_at = now() + interval '1 day'
 where round_id = (select max(id) from public.rounds) and kickoff_at < now();
set role authenticated;

-- ---------- private leagues ---------------------------------------------
select public.create_league('Test League', (select max(id) from public.rounds), 5, true) as code \gset
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false) \g /dev/null
do $$ begin
  if exists (select 1 from public.leagues) then raise exception 'FAIL: outsider can list private leagues (and their codes)'; end if;
  if exists (select 1 from public.get_league_leaderboard((select min(id) from public.leagues))) then
    raise exception 'FAIL: outsider can read a league table';
  end if;
  begin perform public.join_league((select 'GEBETA-ZZZZ'), true);
        raise exception 'FAIL: joined a league that does not exist';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  private leagues hidden from outsiders';
end $$;
select public.join_league(:'code', false) as mallory_status \gset
reset role;
do $$ begin
  if (select status from public.league_members where user_id = '11111111-0000-0000-0000-000000000003') <> 'pending' then
    raise exception 'FAIL: unpaid player was let into a paid league';
  end if;
  begin perform public.settle_league((select min(id) from public.leagues),
          '[{"user_id":"11111111-0000-0000-0000-000000000002","units":999,"rank":1}]', null);
        raise exception 'FAIL: league paid more than its prize fund';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  unpaid league requests stay pending; payouts capped at the prize fund';
end $$;

\echo 'ALL DATABASE SECURITY TESTS PASSED'
