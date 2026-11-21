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
                           'get_round_leaderboard', 'get_round_pool', 'round_lock_at', 'round_is_bettable',
                           'get_match_pick_split');
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
update public.profiles set phone_verified_at = now(), date_of_birth = date '1990-01-01';
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
  begin perform public.admin_add_units('11111111-0000-0000-0000-000000000001', 501, 'x', null);
        raise exception 'FAIL: deposit above 100,000 ETB accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  deposits limited to 1,000-100,000 ETB';
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

-- ---------- news ---------------------------------------------------------
reset role;
insert into public.news_posts (slug, title, excerpt, body, is_published) values ('tests-draft', 'Draft', 'x', 'draft body text here', false);
insert into public.news_posts (slug, title, excerpt, body, published_at) values ('tests-later', 'Later', 'x', 'scheduled body text', now() + interval '1 day');
set role anon;
do $$ begin
  if exists (select 1 from public.news_posts where slug in ('tests-draft', 'tests-later')) then
    raise exception 'FAIL: visitors can read draft or scheduled news';
  end if;
  if not exists (select 1 from public.news_posts) then raise exception 'FAIL: visitors cannot read published news'; end if;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin insert into public.news_posts (slug, title, excerpt, body) values ('tests-hack', 'Hack', 'x', 'hacked article body');
        raise exception 'FAIL: a player wrote a news article';
  exception when insufficient_privilege then null; end;
  begin update public.news_posts set title = 'hacked';
        raise exception 'FAIL: a player edited a news article';
  exception when insufficient_privilege then null; end;
  begin delete from public.news_posts;
        raise exception 'FAIL: a player deleted news';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.news_posts where slug = 'tests-draft') then raise exception 'FAIL: players can read drafts'; end if;
  raise notice 'ok  news: drafts and scheduled articles hidden, only the server can write';
end $$;
reset role;

-- ---------- private challenges ---------------------------------------------
reset role;
select public.admin_add_units('11111111-0000-0000-0000-000000000001', 100, 'test', null);
select public.admin_add_units('11111111-0000-0000-0000-000000000002', 100, 'test', null);
insert into public.matches (home_team, away_team, kickoff_at) values
  ('Chal A', 'Chal B', now() + interval '1 day'), ('Chal C', 'Chal D', now() + interval '2 days');
create table tests_ch_a as select jsonb_agg(jsonb_build_object('match_id', id, 'home', 2, 'away', 1) order by id) j from public.matches where home_team like 'Chal %';
create table tests_ch_b as select jsonb_agg(jsonb_build_object('match_id', id, 'home', 0, 'away', 3) order by id) j from public.matches where home_team like 'Chal %';
create table tests_ch_1 as select jsonb_build_array(j -> 0) j from tests_ch_a;
create table tests_bal as select id, balance_units from public.profiles;
grant select on tests_ch_a, tests_ch_b, tests_ch_1, tests_bal to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false) \g /dev/null
select public.create_challenge('Derby bet', 30, null, (select j from tests_ch_a)) \g /dev/null
select public.create_challenge('Lonely bet', 5, null, (select j from tests_ch_1)) \g /dev/null
select public.create_challenge('Oops bet', 5, 2, (select j from tests_ch_1)) \g /dev/null
do $$ begin
  if (select balance_units from public.profiles where id = auth.uid()) <> (select balance_units from tests_bal where id = auth.uid()) - 40 then
    raise exception 'FAIL: challenge stakes not taken from the creator';
  end if;
  begin perform 1 from public.challenges;
        raise exception 'FAIL: challenges table readable directly';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.challenge_picks;
        raise exception 'FAIL: challenge picks readable directly';
  exception when insufficient_privilege then null; end;
  begin perform public.create_challenge('Too big', 99999, null, (select j from tests_ch_a));
        raise exception 'FAIL: stake above the limit accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.create_challenge('Odd stake', 1.1, null, (select j from tests_ch_a));
        raise exception 'FAIL: stake not in 50 ETB steps accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.settle_due_challenges();
        raise exception 'FAIL: a player can run challenge settlement';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
create table tests_codes as select code, title from public.challenges;
grant select on tests_codes to authenticated;
set role authenticated;
select public.cancel_challenge((select code from tests_codes where title = 'Oops bet')) \g /dev/null

-- bob joins the derby
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false) \g /dev/null
do $$ declare v jsonb; begin
  begin perform public.join_challenge((select code from tests_codes where title = 'Derby bet'), (select j from tests_ch_1));
        raise exception 'FAIL: joined a challenge without a score for every match';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.join_challenge((select code from tests_codes where title = 'Derby bet'), (select j from tests_ch_b));
  begin perform public.join_challenge((select code from tests_codes where title = 'Derby bet'), (select j from tests_ch_b));
        raise exception 'FAIL: joined the same challenge twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.cancel_challenge((select code from tests_codes where title = 'Derby bet'));
        raise exception 'FAIL: a player cancelled someone else''s challenge';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.join_challenge((select code from tests_codes where title = 'Oops bet'), (select j from tests_ch_1));
        raise exception 'FAIL: joined a cancelled challenge';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  v := public.get_challenge((select code from tests_codes where title = 'Derby bet'));
  if exists (select 1 from jsonb_array_elements(v -> 'entries') e where not (e ->> 'is_me')::boolean and e -> 'picks' <> 'null'::jsonb) then
    raise exception 'FAIL: other players'' challenge picks visible before kickoff';
  end if;
  if (v ->> 'players')::int <> 2 then raise exception 'FAIL: challenge should have 2 players'; end if;
end $$;

-- mallory can't join without the stake in her wallet
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false) \g /dev/null
do $$ begin
  if (select balance_units from public.profiles where id = auth.uid()) >= 30 then raise exception 'FAIL: test setup: mallory has too much money'; end if;
  begin perform public.join_challenge((select code from tests_codes where title = 'Derby bet'), (select j from tests_ch_b));
        raise exception 'FAIL: joined a challenge without enough balance';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  challenges: stake locked, scores for every match, picks hidden, no joining without the money';
end $$;

-- matches kick off and finish: Chal A 2-1 (alice exact 3), Chal C 1-0 (alice close 1.5); bob 0-3 wrong twice
reset role;
update public.matches set kickoff_at = now() - interval '3 hours', status = 'finished', actual_home_score = 2, actual_away_score = 1 where home_team = 'Chal A';
update public.matches set kickoff_at = now() - interval '2 hours', status = 'finished', actual_home_score = 1, actual_away_score = 0 where home_team = 'Chal C';
update public.challenges set lock_at = now() - interval '3 hours';
select public.settle_due_challenges() \g /dev/null
do $$ begin
  if (select status from public.challenges c join tests_codes t using (code) where t.title = 'Derby bet') <> 'settled' then
    raise exception 'FAIL: finished challenge not settled';
  end if;
  -- fair fee (0049): alice's own 30 back + bob's 30 minus 10% = 57
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-000000000001')
     <> (select balance_units from tests_bal where id = '11111111-0000-0000-0000-000000000001') - 30 + 57 then
    raise exception 'FAIL: challenge winner not paid own stake + 90%% of the other stake (or other stakes not refunded)';
  end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-000000000002')
     <> (select balance_units from tests_bal where id = '11111111-0000-0000-0000-000000000002') - 30 then
    raise exception 'FAIL: challenge loser balance wrong';
  end if;
  if (select status from public.challenges c join tests_codes t using (code) where t.title = 'Lonely bet') <> 'refunded' then
    raise exception 'FAIL: challenge nobody joined was not refunded';
  end if;
  if (select points from public.challenge_entries where user_id = '11111111-0000-0000-0000-000000000001'
        and challenge_id = (select id from public.challenges where title = 'Derby bet')) <> 4.5 then
    raise exception 'FAIL: challenge points wrong';
  end if;
  raise notice 'ok  challenges: winner gets 90%% of the pot, empty challenges refunded, cancel refunds';
end $$;

-- ---------- match prediction pages -----------------------------------------
reset role;
insert into public.match_previews (match_id, pick_home, pick_away, verdict, is_published)
  select id, 2, 1, 'Home side should edge a tight game here.', false from public.matches where home_team = 'Home FC';
set role anon;
do $$ declare r record; begin
  if exists (select 1 from public.match_previews) then raise exception 'FAIL: visitors can read unpublished previews'; end if;
  begin insert into public.match_previews (match_id, pick_home, pick_away, verdict)
          select id, 1, 1, 'A sneaky preview written by a visitor.' from public.matches limit 1;
        raise exception 'FAIL: a visitor wrote a match preview';
  exception when insufficient_privilege then null; end;
  -- pick split never shows percentages before kickoff
  reset role;
  insert into public.matches (home_team, away_team, kickoff_at) values ('Split A', 'Split B', now() + interval '3 days');
  set role anon;
  select * into r from public.get_match_pick_split((select id from public.matches where home_team = 'Split A'));
  if r.home_win is not null or r.top_score is not null then raise exception 'FAIL: pick split shown before kickoff'; end if;
  raise notice 'ok  match previews: drafts hidden, only the server writes, pick split hidden before kickoff';
end $$;
reset role;

-- ---------- age, photos -----------------------------------------------------
reset role;
do $$ begin
  begin insert into auth.users (id, raw_user_meta_data) values
          ('11111111-0000-0000-0000-0000000000aa', jsonb_build_object('username', 'kid', 'phone_number', '+251911000099',
            'date_of_birth', to_char(now() - interval '17 years', 'YYYY-MM-DD')));
        raise exception 'FAIL: an under-18 account was created';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
insert into auth.users (id, raw_user_meta_data) values
  ('11111111-0000-0000-0000-0000000000ab', jsonb_build_object('username', 'grownup', 'phone_number', '+251911000098', 'date_of_birth', '1990-05-01'));
update public.profiles set date_of_birth = null where id = '11111111-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false) \g /dev/null
do $$ begin
  if (select date_of_birth from public.profiles where username = 'grownup') is not null then
    raise exception 'FAIL: players can read other players'' date of birth';
  end if;
  begin perform public.set_my_date_of_birth((now() - interval '10 years')::date);
        raise exception 'FAIL: a player set an under-18 date of birth';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.set_my_date_of_birth(date '1995-01-01');
  begin perform public.set_my_date_of_birth(date '1980-01-01');
        raise exception 'FAIL: date of birth could be changed after it was set';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin update public.profiles set avatar_url = 'https://evil.example/x.png' where id = auth.uid();
        raise exception 'FAIL: a player set their picture URL directly';
  exception when insufficient_privilege then null; end;
  raise notice 'ok  age: under-18 blocked at sign-up, date of birth set once; pictures only via the server';
end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.get_avatars(array['alice']);
        raise exception 'FAIL: visitors can list player pictures';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select date_of_birth from public.profiles where username = 'grownup') <> date '1990-05-01' then
    raise exception 'FAIL: date of birth not saved at sign-up';
  end if;
end $$;

-- ---------- responsible play ----------------------------------------------
reset role;
insert into public.matches (home_team, away_team, kickoff_at) values ('Break A', 'Break B', now() + interval '2 days');
create table tests_rp as select jsonb_build_array(jsonb_build_object('match_id', id, 'home', 1, 'away', 0)) j from public.matches where home_team = 'Break A';
grant select on tests_rp to authenticated;
select public.admin_add_units('11111111-0000-0000-0000-000000000002', 20, 'test', null);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false) \g /dev/null
do $$ begin
  -- deposit limit: set 20 units/week; bob already got deposits this week, so the admin can't add more
  perform public.set_deposit_limit(20);
  if public.set_deposit_limit(500) <> 'in 7 days' then raise exception 'FAIL: raising a deposit limit was not delayed 7 days'; end if;
  if public.set_deposit_limit(10) <> 'now' then raise exception 'FAIL: lowering a deposit limit was not immediate'; end if;
  begin perform public.take_a_break(3);
        raise exception 'FAIL: a break of any length was accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.take_a_break(1);
  begin perform public.create_challenge('Break bet', 1, null, (select j from tests_rp));
        raise exception 'FAIL: a player on a break placed a bet';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin update public.profiles set excluded_until = null where id = auth.uid();
        raise exception 'FAIL: a player ended their own break early';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  begin perform public.admin_add_units('11111111-0000-0000-0000-000000000002', 5, 'over limit', null);
        raise exception 'FAIL: a deposit over the player''s weekly limit was accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- no date of birth / under 18 = no bets
update public.profiles set date_of_birth = null where id = '11111111-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false) \g /dev/null
do $$ begin
  begin perform public.create_challenge('No birthday bet', 1, null, (select j from tests_rp));
        raise exception 'FAIL: a player without a date of birth placed a bet';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
update public.profiles set date_of_birth = (now() - interval '16 years')::date where id = '11111111-0000-0000-0000-000000000001';
set role authenticated;
do $$ begin
  begin perform public.create_challenge('Kid bet', 1, null, (select j from tests_rp));
        raise exception 'FAIL: an under-18 player placed a bet';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok  responsible play: breaks, deposit limits (7-day cooling-off) and 18+ enforced by the database';
end $$;
reset role;
update public.profiles set date_of_birth = date '1990-01-01' where id = '11111111-0000-0000-0000-000000000001';

-- 0029: deposits need a saved 18+ date of birth too
update public.profiles set date_of_birth = null where id = '11111111-0000-0000-0000-000000000001';
do $$ begin
  begin perform public.admin_add_units('11111111-0000-0000-0000-000000000001', 5, 'no dob', null);
        raise exception 'FAIL: deposit accepted without a date of birth';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
update public.profiles set date_of_birth = (now() - interval '16 years')::date where id = '11111111-0000-0000-0000-000000000001';
do $$ begin
  begin perform public.admin_add_units('11111111-0000-0000-0000-000000000001', 5, 'kid', null);
        raise exception 'FAIL: deposit accepted from an under-18 player';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
update public.profiles set date_of_birth = date '1990-01-01' where id = '11111111-0000-0000-0000-000000000001';
select public.admin_add_units('11111111-0000-0000-0000-000000000001', 5, 'adult ok', null);
do $$ begin raise notice 'ok  18+ everywhere: deposits refused without an 18+ date of birth'; end $$;

-- 0030: one automatic round per slot per day; winners list is readable, only for settled rounds
insert into public.rounds (name, entry_fee_units, status, auto_slot, auto_date) values ('Morning 10 · test', 1, 'draft', 'morning', date '2030-01-01');
do $$ begin
  begin insert into public.rounds (name, entry_fee_units, status, auto_slot, auto_date) values ('dup', 1, 'draft', 'morning', date '2030-01-01');
        raise exception 'FAIL: two automatic rounds for the same slot and day';
  exception when unique_violation then null; end;
  begin insert into public.rounds (name, entry_fee_units, status, auto_slot, auto_date) values ('bad', 1, 'draft', 'lunch', date '2030-01-01');
        raise exception 'FAIL: unknown slot accepted';
  exception when check_violation then null; end;
end $$;
set role authenticated;
do $$ begin
  if exists (select 1 from public.get_round_winners(array(select id from public.rounds where status <> 'settled'))) then
    raise exception 'FAIL: winners shown for a round that is not settled';
  end if;
  perform * from public.get_round_winners(array(select id from public.rounds));
  raise notice 'ok  automatic rounds: one per slot per day; winners only for settled rounds';
end $$;
reset role;

-- 0031: Gebeta Premium
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
insert into public.rounds (name, entry_fee_units, status) values ('Premium test', 1, 'draft');
insert into public.matches (round_id, home_team, away_team, kickoff_at)
select (select max(id) from public.rounds where name = 'Premium test'), 'H' || g, 'A' || g, now() + interval '2 days' + g * interval '1 minute'
  from generate_series(1, 10) g;
update public.rounds set status = 'open' where name = 'Premium test';
insert into public.slips (round_id, user_id, slip_no)
select r.id, '11111111-0000-0000-0000-000000000001', g from public.rounds r, generate_series(1, 4) g where r.name = 'Premium test';
insert into public.slip_picks (slip_id, match_id, home, away)
select s.id, m.id, 2, 1 from public.slips s join public.rounds r on r.id = s.round_id and r.name = 'Premium test' join public.matches m on m.round_id = r.id;
select public.admin_add_units((select id from public.profiles where username = 'grownup'), 25, 'test', null);
create table public.tests_prem as
  select r.id as rid, (select min(s.id) from public.slips s where s.round_id = r.id) as sid from public.rounds r where r.name = 'Premium test';
grant select on public.tests_prem to authenticated;

select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000ab', false) \g /dev/null
set role authenticated;
do $$ begin
  begin perform * from public.get_round_crowd((select rid from public.tests_prem));
        raise exception 'FAIL: crowd picks without Premium';
  exception when raise_exception then if sqlerrm not like 'premium only%' then raise exception 'FAIL: wrong reason: %', sqlerrm; end if; end;
  begin perform * from public.get_slip_detail((select sid from public.tests_prem));
        raise exception 'FAIL: slip shown without Premium';
  exception when raise_exception then if sqlerrm not like 'premium only%' then raise exception 'FAIL: wrong reason: %', sqlerrm; end if; end;
  begin perform public.buy_premium('weekly'); raise exception 'FAIL: unknown plan accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.buy_premium('monthly');
  perform public.buy_premium('yearly');
  if (select balance_units from public.profiles where id = auth.uid()) <> 3 then raise exception 'FAIL: Premium price not taken from the wallet'; end if;
  if (select current_period_end from public.subscriptions where user_id = auth.uid()) < now() + interval '394 days' then
    raise exception 'FAIL: yearly not added on top of monthly';
  end if;
  begin perform public.buy_premium('yearly'); raise exception 'FAIL: Premium bought without enough Units';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- 4 slips: too few for crowd stats (could reveal someone's picks)
  if exists (select 1 from public.get_round_crowd((select rid from public.tests_prem))) then
    raise exception 'FAIL: crowd stats with fewer than 5 slips';
  end if;
  -- before the lock even Premium can't see a slip
  begin perform * from public.get_slip_detail((select sid from public.tests_prem));
        raise exception 'FAIL: Premium saw picks before the lock';
  exception when raise_exception then if sqlerrm not like '%secret%' then raise exception 'FAIL: wrong reason: %', sqlerrm; end if; end;
  begin update public.subscriptions set current_period_end = now() + interval '50 years'; 
        if found then raise exception 'FAIL: player extended their own Premium'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.slips (round_id, user_id, slip_no)
select r.id, '11111111-0000-0000-0000-000000000001', 5 from public.rounds r where r.name = 'Premium test';
insert into public.slip_picks (slip_id, match_id, home, away)
select s.id, m.id, 0, 0 from public.slips s join public.matches m on m.round_id = s.round_id
 where s.slip_no = 5 and s.round_id = (select rid from public.tests_prem);
set role authenticated;
do $$
declare c record;
begin
  select * into c from public.get_round_crowd((select rid from public.tests_prem)) limit 1;
  if c.slips <> 5 or c.home_pct <> 80 or c.draw_pct <> 20 or c.top_score <> '2-1' then raise exception 'FAIL: crowd stats wrong: %', c; end if;
end $$;
reset role;
update public.matches set kickoff_at = now() - interval '1 hour' where round_id = (select rid from public.tests_prem);
set role authenticated;
do $$ begin
  if (select count(*) from public.get_slip_detail((select sid from public.tests_prem))) <> 10 then
    raise exception 'FAIL: Premium could not see a slip after the lock';
  end if;
end $$;
-- 0033: after the lock everyone sees the crowd split (not just Premium)
reset role;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false) \g /dev/null
set role authenticated;
do $$ begin
  if (select count(*) from public.get_round_crowd((select rid from public.tests_prem))) <> 10 then
    raise exception 'FAIL: free player cannot see the crowd split after the lock';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000ab', false) \g /dev/null
-- renewals: renews from the wallet, then ends quietly when the money runs out
update public.subscriptions set current_period_end = now() - interval '1 hour', plan = 'monthly' where user_id = (select id from public.profiles where username = 'grownup');
do $$ begin
  if public.renew_due_subscriptions() <> 1 then raise exception 'FAIL: Premium not renewed'; end if;
  if (select balance_units from public.profiles where username = 'grownup') <> 1 then raise exception 'FAIL: renewal not charged'; end if;
end $$;
update public.subscriptions set current_period_end = now() - interval '1 hour' where user_id = (select id from public.profiles where username = 'grownup');
do $$ begin
  if public.renew_due_subscriptions() <> 0 then raise exception 'FAIL: renewed without enough Units'; end if;
  if (select auto_renew from public.subscriptions where user_id = (select id from public.profiles where username = 'grownup')) then
    raise exception 'FAIL: auto-renew still on after a failed renewal';
  end if;
  if (select balance_units from public.profiles where username = 'grownup') <> 1 then raise exception 'FAIL: failed renewal touched the wallet'; end if;
  raise notice 'ok  premium: paid from the wallet, renews or ends, crowd stats need 5 slips, slips only after the lock';
end $$;
drop table public.tests_prem;

-- ---------- quiz: answers and leaderboard are server-only ----------
do $$
begin
  if has_function_privilege('authenticated', 'public.quiz_leaderboard(timestamptz, timestamptz, int)', 'execute')
     or has_function_privilege('anon', 'public.quiz_leaderboard(timestamptz, timestamptz, int)', 'execute') then
    raise exception 'FAIL: clients can call quiz_leaderboard directly';
  end if;
  if has_table_privilege('authenticated', 'public.quiz_questions', 'select') or has_table_privilege('anon', 'public.quiz_questions', 'select') then
    raise exception 'FAIL: clients can read quiz questions (and the right answers)';
  end if;
  if has_table_privilege('authenticated', 'public.quiz_answers', 'insert') or has_table_privilege('authenticated', 'public.quiz_answers', 'update') then
    raise exception 'FAIL: players can write their own quiz answers';
  end if;
  raise notice 'ok  quiz: questions, answers and leaderboard are server-only';
end $$;

-- ---------- challenge invites by phone (0053) ----------
reset role;
do $$
begin
  if has_table_privilege('authenticated', 'public.challenge_invites', 'select') or has_table_privilege('anon', 'public.challenge_invites', 'select')
     or has_table_privilege('authenticated', 'public.challenge_invites', 'insert') then
    raise exception 'FAIL: challenge invites readable or writable directly';
  end if;
  if has_function_privilege('anon', 'public.invite_to_challenge(text, text[])', 'execute')
     or has_function_privilege('anon', 'public.my_challenge_invites()', 'execute')
     or has_function_privilege('anon', 'public.challenge_invite_list(text)', 'execute') then
    raise exception 'FAIL: logged-out visitors can run invite functions';
  end if;
  if has_function_privilege('authenticated', 'public.notify_challenge_invite(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.challenge_invites_on_verify()', 'execute') then
    raise exception 'FAIL: players can run internal invite functions';
  end if;
end $$;
select public.admin_add_units('11111111-0000-0000-0000-000000000001', 50, 'test', null) \g /dev/null
insert into public.matches (home_team, away_team, kickoff_at) values ('Inv A', 'Inv B', now() + interval '3 days');
create table tests_inv_j as select jsonb_build_array(jsonb_build_object('match_id', id, 'home', 1, 'away', 0)) j from public.matches where home_team = 'Inv A';
grant select on tests_inv_j to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false) \g /dev/null
select public.create_challenge('Invite bet', 5, null, (select j from tests_inv_j)) \g /dev/null
reset role;
create table tests_inv_code as select code from public.challenges where title = 'Invite bet';
grant select on tests_inv_code to authenticated;
create table tests_inv_res (r jsonb);
grant select, insert on tests_inv_res to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false) \g /dev/null
insert into tests_inv_res select public.invite_to_challenge((select code from tests_inv_code),
  array['+251911000002', '+251911000009', '+251911000001', '+25191', '+251911000009']);
reset role;
do $$
declare v_code text := (select code from tests_inv_code); v_r jsonb := (select r from tests_inv_res);
begin
  if v_r -> 0 ->> 'status' <> 'notified'        then raise exception 'FAIL: invite to an existing player: %', v_r; end if;
  if v_r -> 1 ->> 'status' <> 'not_on_app'      then raise exception 'FAIL: invite to a number with no account: %', v_r; end if;
  if v_r -> 2 ->> 'status' <> 'self'            then raise exception 'FAIL: invited myself: %', v_r; end if;
  if v_r -> 3 ->> 'status' <> 'invalid'         then raise exception 'FAIL: invalid number accepted: %', v_r; end if;
  if v_r -> 4 ->> 'status' <> 'already_invited' then raise exception 'FAIL: same number invited twice: %', v_r; end if;
  if (select count(*) from public.notifications where user_id = '11111111-0000-0000-0000-000000000002' and kind = 'challenge_invite' and link = '/challenges/' || v_code) <> 1 then
    raise exception 'FAIL: the invited player got no (or a double) notification';
  end if;
  if not exists (select 1 from public.notifications where kind = 'challenge_invite' and title like '%alice challenged you%' and body like '%Invite bet%' and body like '%ETB%') then
    raise exception 'FAIL: invite notification text is not clear';
  end if;
  if (select count(*) from public.notifications where kind = 'challenge_invite') <> 1 then raise exception 'FAIL: a number with no account got a notification too early'; end if;
end $$;
-- only the creator can invite; strangers cannot list invites
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false) \g /dev/null
do $$
begin
  begin perform public.invite_to_challenge((select code from tests_inv_code), array['+251911000005']);
        raise exception 'FAIL: a stranger invited players to someone elses challenge';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  if exists (select 1 from public.challenge_invite_list((select code from tests_inv_code))) then raise exception 'FAIL: a stranger can read the invite list'; end if;
  if exists (select 1 from public.my_challenge_invites()) then raise exception 'FAIL: an uninvited player sees invitations'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false) \g /dev/null
do $$
begin
  if (select count(*) from public.my_challenge_invites()) <> 1 then raise exception 'FAIL: invited player does not see the invitation'; end if;
  if exists (select 1 from public.challenge_invite_list((select code from tests_inv_code))) then raise exception 'FAIL: invited player can read the creators invite list'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false) \g /dev/null
do $$
begin
  if (select count(*) from public.challenge_invite_list((select code from tests_inv_code))) <> 2 then raise exception 'FAIL: creator sees the wrong invite list'; end if;
end $$;
-- someone signs up with the number that had no account: the invite arrives when the phone is confirmed
reset role;
insert into auth.users (id, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000009', '{"username":"newbie","phone_number":"+251911000009"}');
do $$ begin
  if exists (select 1 from public.notifications where user_id = '11111111-0000-0000-0000-000000000009' and kind = 'challenge_invite') then
    raise exception 'FAIL: invite delivered before the phone was confirmed';
  end if;
end $$;
update public.profiles set phone_verified_at = now(), date_of_birth = date '1990-01-01' where username = 'newbie';
do $$ begin
  if (select count(*) from public.notifications where user_id = '11111111-0000-0000-0000-000000000009' and kind = 'challenge_invite') <> 1 then
    raise exception 'FAIL: invite not delivered when the new player confirmed the phone';
  end if;
  if (select count(*) from public.challenge_invites where user_id = '11111111-0000-0000-0000-000000000009') <> 1 then
    raise exception 'FAIL: invite not linked to the new player';
  end if;
  raise notice 'ok  challenge invites: server-only, creator-only, delivered now or when the number signs up';
end $$;
drop table tests_inv_j, tests_inv_code, tests_inv_res;

-- ---------- ending a player's sessions is server-only (0054) ----------
reset role;
do $$
begin
  if has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'execute')
     or has_function_privilege('anon', 'public.revoke_user_sessions(uuid)', 'execute') then
    raise exception 'FAIL: players can end other players sessions';
  end if;
  perform public.revoke_user_sessions('11111111-0000-0000-0000-000000000001'); -- runs (nothing to end in this test database)
  raise notice 'ok  revoke_user_sessions: server-only';
end $$;

-- ---------- Quiz Royale (0056) ----------
-- three fresh players (earlier tests put some of the others on a break or a deposit limit)
reset role;
insert into auth.users (id, raw_user_meta_data) values
  ('11111111-0000-0000-0000-0000000000a1', '{"username":"royal_a","phone_number":"+251911000071"}'),
  ('11111111-0000-0000-0000-0000000000a2', '{"username":"royal_b","phone_number":"+251911000072"}'),
  ('11111111-0000-0000-0000-0000000000a3', '{"username":"royal_c","phone_number":"+251911000073"}');
update public.profiles set phone_verified_at = now(), date_of_birth = date '1990-01-01' where username like 'royal\_%';
reset role;
do $$
begin
  if has_table_privilege('authenticated', 'public.royale_questions', 'select') or has_table_privilege('anon', 'public.royale_questions', 'select')
     or has_table_privilege('authenticated', 'public.royale_answers', 'select') or has_table_privilege('authenticated', 'public.royale_rooms', 'select')
     or has_table_privilege('authenticated', 'public.royale_players', 'insert') then
    raise exception 'FAIL: Quiz Royale tables readable or writable directly (the right answers!)';
  end if;
  if has_function_privilege('anon', 'public.royale_state(text)', 'execute') or has_function_privilege('anon', 'public.royale_answer(text, int, int)', 'execute')
     or has_function_privilege('anon', 'public.royale_create(numeric, int)', 'execute') or has_function_privilege('anon', 'public.royale_join(text)', 'execute') then
    raise exception 'FAIL: logged-out visitors can run Quiz Royale functions';
  end if;
  if has_function_privilege('authenticated', 'public.royale_settle_if_due(bigint)', 'execute') or has_function_privilege('authenticated', 'public.settle_due_royale()', 'execute')
     or has_function_privilege('authenticated', 'public.royale_refund_all(bigint, text)', 'execute') or has_function_privilege('authenticated', 'public.royale_code()', 'execute') then
    raise exception 'FAIL: players can run internal Quiz Royale money functions';
  end if;
end $$;

select public.admin_add_units('11111111-0000-0000-0000-0000000000a1', 50, 'test', null) \g /dev/null
select public.admin_add_units('11111111-0000-0000-0000-0000000000a2', 50, 'test', null) \g /dev/null
create table tests_ro (code text, c0 smallint);
grant select, insert, update on tests_ro to authenticated;
create table tests_rob (tag text primary key, bal numeric);
insert into tests_rob select 'alice', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_rob select 'bob', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_ro (code) select public.royale_create(5, 3);
do $$
begin
  begin perform public.royale_create(5, 3); raise exception 'FAIL: a second open room for the same creator';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.royale_join((select code from tests_ro)); raise exception 'FAIL: joined the same room twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.royale_start((select code from tests_ro)); raise exception 'FAIL: started with too few players';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- bob joins; mallory has no Units yet and is refused, then joins after a deposit
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.royale_join((select code from tests_ro)) \g /dev/null
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a3', false) \g /dev/null
do $$
begin
  begin perform public.royale_join((select code from tests_ro)); raise exception 'FAIL: joined without enough Units';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select public.admin_add_units('11111111-0000-0000-0000-0000000000a3', 50, 'test', null) \g /dev/null
insert into tests_rob select 'mallory', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a3';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a3', false) \g /dev/null
select public.royale_join((select code from tests_ro)) \g /dev/null

-- only the creator can start; then answers are timed by the database
do $$
begin
  begin perform public.royale_start((select code from tests_ro)); raise exception 'FAIL: a player who is not the creator started the game';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
select public.royale_start((select code from tests_ro)) \g /dev/null
do $$
begin
  begin perform public.royale_answer((select code from tests_ro), 0, 1); raise exception 'FAIL: answered during the countdown';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
-- 2 seconds into question 1
update public.royale_rooms set started_at = now() - interval '2 seconds' where code = (select code from tests_ro);
update tests_ro set c0 = (select q.correct from public.royale_rooms r join public.royale_questions q on q.id = r.question_ids[1] where r.code = tests_ro.code);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
do $$
declare v jsonb := public.royale_state((select code from tests_ro));
begin
  if v ->> 'phase' <> 'question' then raise exception 'FAIL: expected the question phase, got %', v ->> 'phase'; end if;
  if (v -> 'question') ? 'correct' or v -> 'reveal' <> 'null'::jsonb then raise exception 'FAIL: the right answer is visible while the question is open'; end if;
  if jsonb_array_length(v -> 'question' -> 'options') <> 4 then raise exception 'FAIL: the question has no 4 options'; end if;
end $$;
select public.royale_answer((select code from tests_ro), 0, (select c0 from tests_ro)) \g /dev/null
do $$
begin
  begin perform public.royale_answer((select code from tests_ro), 0, 0); raise exception 'FAIL: answered the same question twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.royale_answer((select code from tests_ro), 1, 0); raise exception 'FAIL: answered a question that is not open';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.royale_answer((select code from tests_ro), 0, ((select c0 from tests_ro) + 1) % 4) \g /dev/null
reset role;
do $$
declare a int; b int;
begin
  select score into a from public.royale_players where user_id = '11111111-0000-0000-0000-0000000000a1' and room_id = (select id from public.royale_rooms where code = (select code from tests_ro));
  select score into b from public.royale_players where user_id = '11111111-0000-0000-0000-0000000000a2' and room_id = (select id from public.royale_rooms where code = (select code from tests_ro));
  if a not between 170 and 200 then raise exception 'FAIL: a right answer about 2 seconds in should score 170-200, got %', a; end if;
  if b <> 0 then raise exception 'FAIL: a wrong answer scored %', b; end if;
end $$;

-- after the 15 seconds the right answer is shown; a late answer is refused
update public.royale_rooms set started_at = now() - interval '16 seconds' where code = (select code from tests_ro);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a3', false) \g /dev/null
do $$
declare v jsonb := public.royale_state((select code from tests_ro));
begin
  if v ->> 'phase' <> 'reveal' then raise exception 'FAIL: expected the reveal phase, got %', v ->> 'phase'; end if;
  if (v -> 'reveal' ->> 'correct')::int <> (select c0 from tests_ro) then raise exception 'FAIL: the revealed answer is not the right one'; end if;
  begin perform public.royale_answer((select code from tests_ro), 0, 0); raise exception 'FAIL: a late answer was accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- the game ends: scores 450 / 300 / 0, pot 15 Units, winner gets 5 + 90% of 10 = 14, the house keeps 1
reset role;
update public.royale_players set score = 450, correct = 3, total_ms = 9000 where user_id = '11111111-0000-0000-0000-0000000000a1' and room_id = (select id from public.royale_rooms where code = (select code from tests_ro));
update public.royale_players set score = 300, correct = 2, total_ms = 9000 where user_id = '11111111-0000-0000-0000-0000000000a2' and room_id = (select id from public.royale_rooms where code = (select code from tests_ro));
update public.royale_players set score = 0, correct = 0, total_ms = 0 where user_id = '11111111-0000-0000-0000-0000000000a3' and room_id = (select id from public.royale_rooms where code = (select code from tests_ro));
update public.royale_rooms set started_at = now() - interval '200 seconds' where code = (select code from tests_ro);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a3', false) \g /dev/null
do $$
declare v jsonb := public.royale_state((select code from tests_ro));
begin
  if v ->> 'status' <> 'settled' then raise exception 'FAIL: the game was not settled when it ended: %', v ->> 'status'; end if;
  if jsonb_array_length(v -> 'review') <> 10 then raise exception 'FAIL: the review of the 10 questions is missing'; end if;
end $$;
reset role;
do $$
declare ba numeric; bb numeric; bm numeric; pay numeric;
begin
  select balance_units into ba from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
  select balance_units into bb from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
  select balance_units into bm from public.profiles where id = '11111111-0000-0000-0000-0000000000a3';
  select payout_units into pay from public.royale_players where user_id = '11111111-0000-0000-0000-0000000000a1' and room_id = (select id from public.royale_rooms where code = (select code from tests_ro));
  if pay <> 14 then raise exception 'FAIL: winner payout should be 14, got %', pay; end if;
  if ba <> (select bal from tests_rob where tag = 'alice') + 9 or bb <> (select bal from tests_rob where tag = 'bob') - 5 or bm <> (select bal from tests_rob where tag = 'mallory') - 5 then
    raise exception 'FAIL: after the game the winner should be +9 (14 back for 5) and the others -5, got % / % / %', ba, bb, bm;
  end if;
  if (select count(*) from public.wallet_ledger where kind = 'payout' and royale_id is not null) <> 1 then raise exception 'FAIL: more than one payout row'; end if;
  if not exists (select 1 from public.notifications where user_id = '11111111-0000-0000-0000-0000000000a2' and kind = 'royale_result') then raise exception 'FAIL: no result message for the others'; end if;
end $$;
-- settling again changes nothing
select public.settle_due_royale() \g /dev/null
do $$ begin
  if (select count(*) from public.wallet_ledger where kind = 'payout' and royale_id is not null) <> 1 then raise exception 'FAIL: a second settle paid again'; end if;
end $$;

-- a room that never starts is refunded in full; a game nobody scores in refunds every stake
update tests_ro set code = null, c0 = null;
insert into tests_rob select 'alice2', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_ro (code) select public.royale_create(5, 3);
reset role;
update public.royale_rooms set expires_at = now() - interval '1 minute' where code = (select code from tests_ro where code is not null);
select public.settle_due_royale() \g /dev/null
do $$
begin
  if (select status from public.royale_rooms where code = (select code from tests_ro where code is not null)) <> 'cancelled' then raise exception 'FAIL: an expired room was not cancelled'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_rob where tag = 'alice2') then raise exception 'FAIL: the expired room did not refund the stake'; end if;
end $$;
delete from tests_ro;
insert into tests_rob select 'alice3', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_rob select 'bob3', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_ro (code) select public.royale_create(5, 2);
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.royale_join((select code from tests_ro)) \g /dev/null
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
select public.royale_start((select code from tests_ro)) \g /dev/null
reset role;
update public.royale_rooms set started_at = now() - interval '200 seconds' where code = (select code from tests_ro);
select public.settle_due_royale() \g /dev/null
do $$
begin
  if (select status from public.royale_rooms where code = (select code from tests_ro)) <> 'refunded' then raise exception 'FAIL: nobody scored but the room was not refunded'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_rob where tag = 'alice3') or (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_rob where tag = 'bob3') then
    raise exception 'FAIL: stakes were not all refunded';
  end if;
  raise notice 'ok  quiz royale: server-only, timed by the database, answers hidden until the reveal, fair payout, refunds';
end $$;
drop table tests_ro, tests_rob;

-- =====================================================================
-- Survivor pools (0057)
-- =====================================================================
do $$
begin
  if has_table_privilege('authenticated', 'public.survivor_pools', 'select') or has_table_privilege('authenticated', 'public.survivor_picks', 'select')
     or has_table_privilege('anon', 'public.survivor_players', 'select') or has_table_privilege('authenticated', 'public.survivor_players', 'insert') then
    raise exception 'FAIL: players can read or write Survivor tables directly';
  end if;
  if has_function_privilege('anon', 'public.survivor_state(text)', 'execute') or has_function_privilege('anon', 'public.survivor_pick(text, bigint, text)', 'execute')
     or has_function_privilege('anon', 'public.survivor_create(numeric, int, int)', 'execute') then
    raise exception 'FAIL: anonymous visitors can call Survivor functions';
  end if;
  if has_function_privilege('authenticated', 'public.survivor_advance(bigint)', 'execute') or has_function_privilege('authenticated', 'public.settle_due_survivor()', 'execute')
     or has_function_privilege('authenticated', 'public.survivor_settle(bigint, uuid[])', 'execute') or has_function_privilege('authenticated', 'public.survivor_refund_all(bigint, text)', 'execute') then
    raise exception 'FAIL: players can run internal Survivor money functions';
  end if;
end $$;

update public.matches set provider = 'test';
insert into public.matches (home_team, away_team, kickoff_at)
  select 'SvH' || g, 'SvA' || g, date_trunc('day', now() at time zone 'Africa/Addis_Ababa') at time zone 'Africa/Addis_Ababa' + interval '10 days 12 hours' + g * interval '1 minute'
    from generate_series(1, 4) g;
insert into public.matches (home_team, away_team, kickoff_at)
  select 'SwH' || g, 'SwA' || g, date_trunc('day', now() at time zone 'Africa/Addis_Ababa') at time zone 'Africa/Addis_Ababa' + interval '11 days 12 hours' + g * interval '1 minute'
    from generate_series(1, 4) g;
select public.admin_add_units('11111111-0000-0000-0000-0000000000a1', 50, 'test', null) \g /dev/null
select public.admin_add_units('11111111-0000-0000-0000-0000000000a2', 50, 'test', null) \g /dev/null
select public.admin_add_units('11111111-0000-0000-0000-0000000000a3', 50, 'test', null) \g /dev/null
create table tests_sv (code text);
grant select, insert, update on tests_sv to authenticated;
create table tests_svb (tag text primary key, bal numeric);
insert into tests_svb select 'a1', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_svb select 'a2', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
insert into tests_svb select 'a3', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a3';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_sv (code) select public.survivor_create(5, 3, 7);
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.survivor_join((select code from tests_sv)) \g /dev/null
do $$
begin
  begin perform public.survivor_join((select code from tests_sv)); raise exception 'FAIL: joined twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.survivor_start((select code from tests_sv)); raise exception 'FAIL: non-creator started';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
do $$
begin
  begin perform public.survivor_start((select code from tests_sv)); raise exception 'FAIL: started with too few players';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a3', false) \g /dev/null
select public.survivor_join((select code from tests_sv)) \g /dev/null
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
select public.survivor_start((select code from tests_sv)) \g /dev/null

-- picks: only matches of the current day; a1 and a2 pick, a3 does not; picks stay hidden until the lock
do $$
declare v jsonb := public.survivor_state((select code from tests_sv)); m1 bigint; m2 bigint; mx bigint;
begin
  if v ->> 'status' <> 'live' or jsonb_array_length(v -> 'matches') <> 4 then raise exception 'FAIL: expected a live pool with 4 matches, got %', v; end if;
  select id into m1 from public.matches where home_team = 'SvH1';
  select id into m2 from public.matches where home_team = 'SvH2';
  select id into mx from public.matches where home_team = 'SwH1';
  begin perform public.survivor_pick((select code from tests_sv), mx, 'home'); raise exception 'FAIL: picked a match from another day';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.survivor_pick((select code from tests_sv), m2, 'away');
  perform public.survivor_pick((select code from tests_sv), m1, 'home');
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.survivor_pick((select code from tests_sv), (select id from public.matches where home_team = 'SvH2'), 'home') \g /dev/null
do $$
declare v jsonb := public.survivor_state((select code from tests_sv)); n int;
begin
  select count(*) into n from jsonb_array_elements(v -> 'players') p where (p ->> 'is_me')::boolean = false and p ->> 'pick_team' is not null;
  if n <> 0 then raise exception 'FAIL: other players picks are visible before the lock'; end if;
end $$;
reset role;

-- the day is played: a1 wins (SvH1 2-0), a2 loses (SvH2 0-1), a3 never picked
update public.matches set status = 'finished', actual_home_score = 2, actual_away_score = 0 where home_team = 'SvH1';
update public.matches set status = 'finished', actual_home_score = 0, actual_away_score = 1 where home_team = 'SvH2';
update public.matches set status = 'finished', actual_home_score = 1, actual_away_score = 1 where home_team in ('SvH3', 'SvH4');
select public.settle_due_survivor() \g /dev/null
do $$
declare pay numeric;
begin
  if (select status from public.survivor_pools where code = (select code from tests_sv)) <> 'settled' then raise exception 'FAIL: the pool should be settled, one player left'; end if;
  select payout_units into pay from public.survivor_players where user_id = '11111111-0000-0000-0000-0000000000a1' and pool_id = (select id from public.survivor_pools where code = (select code from tests_sv));
  if pay <> 14 then raise exception 'FAIL: winner payout should be 14, got %', pay; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_svb where tag = 'a1') + 9
     or (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_svb where tag = 'a2') - 5
     or (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a3') <> (select bal from tests_svb where tag = 'a3') - 5 then
    raise exception 'FAIL: wrong balances after the Survivor pool';
  end if;
  if (select out_reason from public.survivor_players where user_id = '11111111-0000-0000-0000-0000000000a3' and pool_id = (select id from public.survivor_pools where code = (select code from tests_sv))) <> 'no pick' then raise exception 'FAIL: a3 should be out for no pick'; end if;
  if not exists (select 1 from public.notifications where user_id = '11111111-0000-0000-0000-0000000000a2' and kind = 'survivor_out') then raise exception 'FAIL: no out message'; end if;
end $$;
select public.settle_due_survivor() \g /dev/null
do $$ begin
  if (select count(*) from public.wallet_ledger where kind = 'payout' and survivor_id is not null) <> 1 then raise exception 'FAIL: a second settle paid again'; end if;
end $$;

-- a pool that never starts is refunded in full
insert into tests_svb select 'a1b', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
delete from tests_sv;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_sv (code) select public.survivor_create(5, 3, 7);
reset role;
update public.survivor_pools set expires_at = now() - interval '1 minute' where code = (select code from tests_sv);
select public.settle_due_survivor() \g /dev/null
do $$
begin
  if (select status from public.survivor_pools where code = (select code from tests_sv)) <> 'cancelled' then raise exception 'FAIL: an expired pool was not cancelled'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_svb where tag = 'a1b') then raise exception 'FAIL: the expired pool did not refund'; end if;
  raise notice 'ok  survivor pools: server-only, picks hidden, last one standing wins, refunds';
end $$;
drop table tests_sv, tests_svb;

-- =====================================================================
-- Gebeta 1 vs 1 (0058)
-- =====================================================================
do $$
begin
  if has_table_privilege('authenticated', 'public.gebeta_games', 'select') or has_table_privilege('anon', 'public.gebeta_games', 'select')
     or has_table_privilege('authenticated', 'public.gebeta_games', 'update') then
    raise exception 'FAIL: players can read or write Gebeta games directly';
  end if;
  if has_function_privilege('anon', 'public.gebeta_move(text, int)', 'execute') or has_function_privilege('anon', 'public.gebeta_state(text)', 'execute')
     or has_function_privilege('anon', 'public.gebeta_create(numeric)', 'execute') then
    raise exception 'FAIL: anonymous visitors can call Gebeta functions';
  end if;
  if has_function_privilege('authenticated', 'public.gebeta_finish(bigint, uuid, text)', 'execute') or has_function_privilege('authenticated', 'public.settle_due_gebeta()', 'execute')
     or has_function_privilege('authenticated', 'public.gebeta_advance(bigint)', 'execute') or has_function_privilege('authenticated', 'public.gebeta_sow(int[], int, int)', 'execute') then
    raise exception 'FAIL: players can run internal Gebeta functions';
  end if;
end $$;

select public.admin_add_units('11111111-0000-0000-0000-0000000000a1', 50, 'test', null) \g /dev/null
select public.admin_add_units('11111111-0000-0000-0000-0000000000a2', 50, 'test', null) \g /dev/null
create table tests_gb (code text);
grant select, insert, update on tests_gb to authenticated;
create table tests_gbb (tag text primary key, bal numeric);
insert into tests_gbb select 'a1', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_gbb select 'a2', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_gb (code) select public.gebeta_create(5);
do $$
begin
  begin perform public.gebeta_create(5); raise exception 'FAIL: a second open game';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.gebeta_join((select code from tests_gb)); raise exception 'FAIL: joined own game';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.gebeta_move((select code from tests_gb), 0); raise exception 'FAIL: moved in a game that has not started';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.gebeta_join((select code from tests_gb)) \g /dev/null
reset role;

-- rules, on a board I set up: player 1 to move, pit 0 has 1 seed, pit 1 is empty and the pit opposite has 4 -> capture 5
update public.gebeta_games set turn = 1, turn_deadline = now() + interval '60 seconds',
  board = '{1,0,0,0,0,3, 0, 2,0,5,0,4,0, 0}' where code = (select code from tests_gb);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
do $$
begin
  begin perform public.gebeta_move((select code from tests_gb), 1); raise exception 'FAIL: moved out of turn';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
do $$
begin
  begin perform public.gebeta_move((select code from tests_gb), 1); raise exception 'FAIL: played an empty pit';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select public.gebeta_move((select code from tests_gb), 0) \g /dev/null
reset role;
do $$
declare g public.gebeta_games;
begin
  select * into g from public.gebeta_games where code = (select code from tests_gb);
  if g.board[7] <> 5 or g.board[2] <> 0 or g.board[12] <> 0 then raise exception 'FAIL: capture wrong, board %', g.board; end if;
  if g.turn <> 2 then raise exception 'FAIL: turn should pass to the opponent after a capture'; end if;
end $$;

-- extra turn: pit 2 has 4 seeds, the last one lands in my store
update public.gebeta_games set turn = 1, turn_deadline = now() + interval '60 seconds',
  board = '{0,0,4,0,0,1, 0, 0,1,0,0,0,0, 0}' where code = (select code from tests_gb);
set role authenticated;
select public.gebeta_move((select code from tests_gb), 2) \g /dev/null
reset role;
do $$
declare g public.gebeta_games;
begin
  select * into g from public.gebeta_games where code = (select code from tests_gb);
  if g.turn <> 1 or g.board[7] <> 1 then raise exception 'FAIL: last seed in my store should give another turn, got turn % board %', g.turn, g.board; end if;
  -- the opponent's store is skipped: 14 seeds from pit 0 go all the way round
end $$;

-- one side empties: the other keeps the rest; 21 vs 16 -> creator wins 5 + 90% of 5 = 9.5
update public.gebeta_games set turn = 1, turn_deadline = now() + interval '60 seconds',
  board = '{0,0,0,0,0,1, 20, 6,0,0,0,0,0, 10}' where code = (select code from tests_gb);
set role authenticated;
select public.gebeta_move((select code from tests_gb), 5) \g /dev/null
reset role;
do $$
begin
  if (select status from public.gebeta_games where code = (select code from tests_gb)) <> 'settled' then raise exception 'FAIL: the game should be finished'; end if;
  if (select winner_id from public.gebeta_games where code = (select code from tests_gb)) <> '11111111-0000-0000-0000-0000000000a1' then raise exception 'FAIL: wrong winner'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_gbb where tag = 'a1') + 4.5
     or (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_gbb where tag = 'a2') - 5 then
    raise exception 'FAIL: wrong balances after the Gebeta game';
  end if;
end $$;
select public.settle_due_gebeta() \g /dev/null
do $$ begin
  if (select count(*) from public.wallet_ledger where kind = 'payout' and gebeta_id is not null) <> 1 then raise exception 'FAIL: paid twice'; end if;
end $$;

-- a player who lets the 60 seconds run out loses
delete from tests_gb;
insert into tests_gbb select 'a1b', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_gbb select 'a2b', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_gb (code) select public.gebeta_create(5);
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.gebeta_join((select code from tests_gb)) \g /dev/null
reset role;
update public.gebeta_games set turn = 1, turn_deadline = now() - interval '1 second' where code = (select code from tests_gb);
select public.settle_due_gebeta() \g /dev/null
do $$
begin
  if (select winner_id from public.gebeta_games where code = (select code from tests_gb)) <> '11111111-0000-0000-0000-0000000000a2' or (select result from public.gebeta_games where code = (select code from tests_gb)) <> 'timeout' then
    raise exception 'FAIL: the player who timed out should lose';
  end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_gbb where tag = 'a2b') + 4.5 then raise exception 'FAIL: timeout winner not paid'; end if;
end $$;

-- an open game nobody joins is refunded
delete from tests_gb;
insert into tests_gbb select 'a1c', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_gb (code) select public.gebeta_create(5);
reset role;
update public.gebeta_games set expires_at = now() - interval '1 minute' where code = (select code from tests_gb);
select public.settle_due_gebeta() \g /dev/null
do $$
begin
  if (select status from public.gebeta_games where code = (select code from tests_gb)) <> 'cancelled' then raise exception 'FAIL: expired game not cancelled'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_gbb where tag = 'a1c') then raise exception 'FAIL: expired game did not refund'; end if;
  raise notice 'ok  gebeta 1v1: server-only, rules (capture, extra turn, sweep), payout, timeout, refund';
end $$;
drop table tests_gb, tests_gbb;

-- =====================================================================
-- Dama 1 vs 1 (0059)
-- =====================================================================
do $$
begin
  if has_table_privilege('authenticated', 'public.dama_games', 'select') or has_table_privilege('anon', 'public.dama_games', 'select')
     or has_table_privilege('authenticated', 'public.dama_games', 'update') then
    raise exception 'FAIL: players can read or write Dama games directly';
  end if;
  if has_function_privilege('anon', 'public.dama_move(text, int, int)', 'execute') or has_function_privilege('anon', 'public.dama_state(text)', 'execute')
     or has_function_privilege('anon', 'public.dama_create(numeric)', 'execute') then
    raise exception 'FAIL: anonymous visitors can call Dama functions';
  end if;
  if has_function_privilege('authenticated', 'public.dama_finish(bigint, uuid, text)', 'execute') or has_function_privilege('authenticated', 'public.settle_due_dama()', 'execute')
     or has_function_privilege('authenticated', 'public.dama_legal_moves(int[], int, int)', 'execute') or has_function_privilege('authenticated', 'public.dama_advance(bigint)', 'execute') then
    raise exception 'FAIL: players can run internal Dama functions';
  end if;
  if (select count(*) from unnest(public.dama_initial_board()) x where x = 1) <> 16 or (select count(*) from unnest(public.dama_initial_board()) x where x = 3) <> 16 then
    raise exception 'FAIL: the starting board should have 16 men each';
  end if;
end $$;

select public.admin_add_units('11111111-0000-0000-0000-0000000000a1', 50, 'test', null) \g /dev/null
select public.admin_add_units('11111111-0000-0000-0000-0000000000a2', 50, 'test', null) \g /dev/null
create table tests_dm (code text);
grant select, insert, update on tests_dm to authenticated;
create table tests_dmb (tag text primary key, bal numeric);
insert into tests_dmb select 'a1', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_dmb select 'a2', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_dm (code) select public.dama_create(5);
do $$
begin
  begin perform public.dama_create(5); raise exception 'FAIL: a second open game';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.dama_move((select code from tests_dm), 8, 16); raise exception 'FAIL: moved in a game that has not started';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.dama_join((select code from tests_dm)) \g /dev/null
reset role;

-- a plain game: player 1 may step forward, not backward or diagonally
update public.dama_games set turn = 1, turn_deadline = now() + interval '60 seconds' where code = (select code from tests_dm);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
do $$
begin
  begin perform public.dama_move((select code from tests_dm), 8, 1); raise exception 'FAIL: moved backwards';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.dama_move((select code from tests_dm), 8, 17); raise exception 'FAIL: moved diagonally';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.dama_move((select code from tests_dm), 8, 16); raise exception 'FAIL: moved onto a friendly piece';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.dama_move((select code from tests_dm), 0, 8); raise exception 'FAIL: moved from an empty cell';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select public.dama_move((select code from tests_dm), 23, 31) \g /dev/null
reset role;
do $$
declare g public.dama_games;
begin
  select * into g from public.dama_games where code = (select code from tests_dm);
  if g.board[32] <> 1 or g.board[24] <> 0 or g.turn <> 2 then raise exception 'FAIL: a plain step was not played, board % turn %', g.board, g.turn; end if;
end $$;

-- compulsory capture and a double jump: p1 men on 20 and 8; p2 men on 28, 44, 63
update public.dama_games set turn = 1, chain_from = null, turn_deadline = now() + interval '60 seconds',
  board = (select array_agg(case when g in (20, 8) then 1 when g in (28, 44, 63) then 3 else 0 end order by g) from generate_series(0, 63) g)
 where code = (select code from tests_dm);
set role authenticated;
do $$
begin
  begin perform public.dama_move((select code from tests_dm), 8, 16); raise exception 'FAIL: a plain move while a capture was possible';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select public.dama_move((select code from tests_dm), 20, 36) \g /dev/null
do $$
declare v jsonb := public.dama_state((select code from tests_dm));
begin
  if (v ->> 'turn')::int <> 1 or (v ->> 'chain_from')::int <> 36 then raise exception 'FAIL: the capture should go on with the same piece: %', v; end if;
  if (v -> 'board' ->> 28)::int <> 0 then raise exception 'FAIL: the captured man is still on the board'; end if;
  if jsonb_array_length(v -> 'legal') <> 1 then raise exception 'FAIL: only the jump should be legal now: %', v -> 'legal'; end if;
  begin perform public.dama_move((select code from tests_dm), 8, 16); raise exception 'FAIL: another piece moved during a capture chain';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select public.dama_move((select code from tests_dm), 36, 52) \g /dev/null
reset role;
do $$
declare g public.dama_games;
begin
  select * into g from public.dama_games where code = (select code from tests_dm);
  if g.turn <> 2 or g.chain_from is not null or g.board[45] <> 0 or g.board[53] <> 1 then raise exception 'FAIL: the double jump was not finished, board % turn %', g.board, g.turn; end if;
end $$;

-- a man that reaches the far row becomes a king
update public.dama_games set turn = 1, chain_from = null, turn_deadline = now() + interval '60 seconds',
  board = (select array_agg(case when g in (52, 8) then 1 when g = 17 then 3 else 0 end order by g) from generate_series(0, 63) g)
 where code = (select code from tests_dm);
set role authenticated;
select public.dama_move((select code from tests_dm), 52, 60) \g /dev/null
reset role;
do $$
begin
  if (select board[61] from public.dama_games where code = (select code from tests_dm)) <> 2 then raise exception 'FAIL: a man on the far row should become a king'; end if;
end $$;

-- the last enemy piece is captured: player 1 wins 5 + 90% of 5 = 9.5
update public.dama_games set turn = 1, chain_from = null, turn_deadline = now() + interval '60 seconds',
  board = (select array_agg(case when g = 20 then 1 when g = 28 then 3 else 0 end order by g) from generate_series(0, 63) g)
 where code = (select code from tests_dm);
set role authenticated;
select public.dama_move((select code from tests_dm), 20, 36) \g /dev/null
reset role;
do $$
begin
  if (select status from public.dama_games where code = (select code from tests_dm)) <> 'settled' or (select winner_id from public.dama_games where code = (select code from tests_dm)) <> '11111111-0000-0000-0000-0000000000a1' then
    raise exception 'FAIL: capturing the last piece should win the game';
  end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_dmb where tag = 'a1') + 4.5
     or (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_dmb where tag = 'a2') - 5 then
    raise exception 'FAIL: wrong balances after the Dama game';
  end if;
end $$;
select public.settle_due_dama() \g /dev/null
do $$ begin
  if (select count(*) from public.wallet_ledger where kind = 'payout' and dama_id is not null) <> 1 then raise exception 'FAIL: paid twice'; end if;
end $$;

-- running out of time loses; an unjoined game is refunded
delete from tests_dm;
insert into tests_dmb select 'a2b', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_dm (code) select public.dama_create(5);
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.dama_join((select code from tests_dm)) \g /dev/null
reset role;
update public.dama_games set turn = 1, turn_deadline = now() - interval '1 second' where code = (select code from tests_dm);
select public.settle_due_dama() \g /dev/null
do $$
begin
  if (select winner_id from public.dama_games where code = (select code from tests_dm)) <> '11111111-0000-0000-0000-0000000000a2' or (select result from public.dama_games where code = (select code from tests_dm)) <> 'timeout' then
    raise exception 'FAIL: the player who timed out should lose';
  end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_dmb where tag = 'a2b') + 4.5 then raise exception 'FAIL: timeout winner not paid'; end if;
end $$;
delete from tests_dm;
insert into tests_dmb select 'a1c', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_dm (code) select public.dama_create(5);
reset role;
update public.dama_games set expires_at = now() - interval '1 minute' where code = (select code from tests_dm);
select public.settle_due_dama() \g /dev/null
do $$
begin
  if (select status from public.dama_games where code = (select code from tests_dm)) <> 'cancelled' then raise exception 'FAIL: expired game not cancelled'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_dmb where tag = 'a1c') then raise exception 'FAIL: expired game did not refund'; end if;
  raise notice 'ok  dama 1v1: server-only, rules (steps, compulsory capture, double jump, king), payout, timeout, refund';
end $$;
drop table tests_dm, tests_dmb;

-- =====================================================================
-- Chess 1 vs 1 (0060)
-- =====================================================================
do $$
begin
  if has_table_privilege('authenticated', 'public.chess_games', 'select') or has_table_privilege('anon', 'public.chess_games', 'select')
     or has_table_privilege('authenticated', 'public.chess_games', 'update') then
    raise exception 'FAIL: players can read or write Chess games directly';
  end if;
  if has_function_privilege('anon', 'public.chess_state(text)', 'execute') or has_function_privilege('anon', 'public.chess_create(numeric, boolean)', 'execute') then
    raise exception 'FAIL: anonymous visitors can call Chess functions';
  end if;
  if has_function_privilege('authenticated', 'public.chess_apply_move(text, uuid, text, text, text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.chess_apply_move(text, uuid, text, text, text, text, text, text)', 'execute') then
    raise exception 'FAIL: players can write chess moves themselves';
  end if;
  if has_function_privilege('authenticated', 'public.chess_finish(bigint, uuid, text)', 'execute') or has_function_privilege('authenticated', 'public.settle_due_chess()', 'execute')
     or has_function_privilege('authenticated', 'public.chess_advance(bigint)', 'execute') then
    raise exception 'FAIL: players can run internal Chess functions';
  end if;
  if not has_function_privilege('service_role', 'public.chess_apply_move(text, uuid, text, text, text, text, text, text)', 'execute') then
    raise exception 'FAIL: the server cannot write chess moves';
  end if;
end $$;

select public.admin_add_units('11111111-0000-0000-0000-0000000000a1', 50, 'test', null) \g /dev/null
select public.admin_add_units('11111111-0000-0000-0000-0000000000a2', 50, 'test', null) \g /dev/null
create table tests_ch (code text);
grant select, insert, update on tests_ch to authenticated;
create table tests_chb (tag text primary key, bal numeric);
insert into tests_chb select 'a1', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_chb select 'a2', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_ch (code) select public.chess_create(5);
do $$
begin
  begin perform public.chess_create(5); raise exception 'FAIL: a second open game';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.chess_join((select code from tests_ch)); raise exception 'FAIL: joined own game';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.chess_join((select code from tests_ch)) \g /dev/null
do $$
declare v jsonb := public.chess_state((select code from tests_ch));
begin
  if v ->> 'status' <> 'live' or v ->> 'my_color' not in ('w', 'b') or v ->> 'turn' <> 'w' then raise exception 'FAIL: the game should be live with colours set: %', v; end if;
end $$;
reset role;

-- the server writes moves: only for the player whose turn it is, on the position it checked
update public.chess_games set white_id = '11111111-0000-0000-0000-0000000000a1' where code = (select code from tests_ch);
do $$
declare s text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
begin
  begin perform public.chess_apply_move((select code from tests_ch), '11111111-0000-0000-0000-0000000000a2', s, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'e4', 'e2', 'e4', null);
        raise exception 'FAIL: black moved on white''s turn';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.chess_apply_move((select code from tests_ch), '11111111-0000-0000-0000-0000000000a1', 'something else w KQkq - 0 1', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'e4', 'e2', 'e4', null);
        raise exception 'FAIL: a move on a different position was accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.chess_apply_move((select code from tests_ch), '11111111-0000-0000-0000-0000000000a1', s, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'e4', 'e9', 'e4', null);
        raise exception 'FAIL: a bad square was accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  if public.chess_apply_move((select code from tests_ch), '11111111-0000-0000-0000-0000000000a1', s, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'e4', 'e2', 'e4', null) <> 'ok' then raise exception 'FAIL: a normal move was not accepted'; end if;
  if (select turn_deadline from public.chess_games where code = (select code from tests_ch)) < now() + interval '100 seconds' then raise exception 'FAIL: the clock was not reset'; end if;
  begin perform public.chess_apply_move((select code from tests_ch), '11111111-0000-0000-0000-0000000000a1', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'x/x/x/x/x/x/x/x w - - 0 2', 'e5', 'e7', 'e5', null);
        raise exception 'FAIL: white moved on black''s turn';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- checkmate: the mover wins 5 + 90% of 5 = 9.5
do $$
declare cur text := (select fen from public.chess_games where code = (select code from tests_ch));
begin
  perform public.chess_apply_move((select code from tests_ch), '11111111-0000-0000-0000-0000000000a2', cur, '4k3/8/8/8/8/8/8/R3K2R w - - 0 9', 'Qxf7#', 'd8', 'f7', 'checkmate');
  if (select status from public.chess_games where code = (select code from tests_ch)) <> 'settled' or (select winner_id from public.chess_games where code = (select code from tests_ch)) <> '11111111-0000-0000-0000-0000000000a2' then
    raise exception 'FAIL: checkmate should end the game for the mover';
  end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_chb where tag = 'a2') + 4.5
     or (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_chb where tag = 'a1') - 5 then
    raise exception 'FAIL: wrong balances after checkmate';
  end if;
end $$;
select public.settle_due_chess() \g /dev/null
do $$ begin
  if (select count(*) from public.wallet_ledger where kind = 'payout' and chess_id is not null) <> 1 then raise exception 'FAIL: paid twice'; end if;
end $$;

-- a draw returns both stakes; running out of time loses; an unjoined game is refunded
delete from tests_ch;
insert into tests_chb select 'a1b', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
insert into tests_chb select 'a2b', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_ch (code) select public.chess_create(5);
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.chess_join((select code from tests_ch)) \g /dev/null
reset role;
update public.chess_games set white_id = '11111111-0000-0000-0000-0000000000a1' where code = (select code from tests_ch);
do $$
declare cur text := (select fen from public.chess_games where code = (select code from tests_ch));
begin
  perform public.chess_apply_move((select code from tests_ch), '11111111-0000-0000-0000-0000000000a1', cur, '7k/8/8/8/8/8/8/K7 b - - 0 40', 'Kb1', 'a1', 'b1', 'draw');
  if (select result from public.chess_games where code = (select code from tests_ch)) <> 'draw' then raise exception 'FAIL: a draw was not recorded'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_chb where tag = 'a1b')
     or (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a2') <> (select bal from tests_chb where tag = 'a2b') then raise exception 'FAIL: a draw did not return both stakes'; end if;
end $$;
delete from tests_ch;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_ch (code) select public.chess_create(5);
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
select public.chess_join((select code from tests_ch)) \g /dev/null
reset role;
update public.chess_games set white_id = '11111111-0000-0000-0000-0000000000a1', turn_deadline = now() - interval '1 second' where code = (select code from tests_ch);
select public.settle_due_chess() \g /dev/null
do $$
begin
  if (select winner_id from public.chess_games where code = (select code from tests_ch)) <> '11111111-0000-0000-0000-0000000000a2' or (select result from public.chess_games where code = (select code from tests_ch)) <> 'timeout' then
    raise exception 'FAIL: white ran out of time, black should win';
  end if;
end $$;
delete from tests_ch;
insert into tests_chb select 'a1c', balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_ch (code) select public.chess_create(5);
reset role;
update public.chess_games set expires_at = now() - interval '1 minute' where code = (select code from tests_ch);
select public.settle_due_chess() \g /dev/null
do $$
begin
  if (select status from public.chess_games where code = (select code from tests_ch)) <> 'cancelled' then raise exception 'FAIL: expired game not cancelled'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> (select bal from tests_chb where tag = 'a1c') then raise exception 'FAIL: expired game did not refund'; end if;
  raise notice 'ok  chess 1v1: server-only moves, turn + position checks, checkmate payout, draw, timeout, refund';
end $$;
drop table tests_ch, tests_chb;

-- =====================================================================
-- House Bot for Chess (0061)
-- =====================================================================
do $$
begin
  if has_table_privilege('authenticated', 'public.house_bot_settings', 'select') or has_table_privilege('anon', 'public.house_bot_settings', 'select')
     or has_table_privilege('authenticated', 'public.house_bot_settings', 'update') then
    raise exception 'FAIL: players can read or change the House Bot settings';
  end if;
  if has_function_privilege('authenticated', 'public.chess_bot_join(text)', 'execute') or has_function_privilege('authenticated', 'public.chess_bot_claim(text)', 'execute')
     or has_function_privilege('authenticated', 'public.house_bot_check(bigint, boolean)', 'execute') or has_function_privilege('anon', 'public.chess_bot_join(text)', 'execute') then
    raise exception 'FAIL: players can run the House Bot functions';
  end if;
  if not has_function_privilege('service_role', 'public.chess_bot_join(text)', 'execute') or not has_function_privilege('service_role', 'public.chess_bot_claim(text)', 'execute') then
    raise exception 'FAIL: the server cannot run the House Bot functions';
  end if;
  if (select enabled from public.house_bot_settings) then raise exception 'FAIL: the House Bot must be switched off until the admin enables it'; end if;
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000b075' and username = 'House Bot') then raise exception 'FAIL: the House Bot account is missing'; end if;
end $$;

select public.admin_add_units('11111111-0000-0000-0000-0000000000a1', 50, 'test', null) \g /dev/null
select public.admin_add_units('11111111-0000-0000-0000-0000000000a2', 50, 'test', null) \g /dev/null
select public.admin_add_units('00000000-0000-4000-8000-00000000b075', 20, 'house bot bank', null) \g /dev/null
create table tests_hb (code text);
grant select, insert, update on tests_hb to authenticated;

-- open games are listed for other players
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into tests_hb (code) select public.chess_create(1, true);
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
do $$ begin
  if not exists (select 1 from public.chess_open_games() where code = (select code from tests_hb)) then raise exception 'FAIL: an open game is not listed for other players'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
do $$ begin
  if exists (select 1 from public.chess_open_games()) then raise exception 'FAIL: my own game is listed as one to join'; end if;
end $$;
reset role;

-- the bot refuses while it is off, while the 2 minutes have not passed, and joins after that
do $$ begin
  if public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot joined while switched off'; end if;
end $$;
update public.house_bot_settings set enabled = true;
do $$ begin
  if public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot joined before the 2 minutes were over'; end if;
end $$;
update public.chess_games set created_at = now() - interval '3 minutes' where code = (select code from tests_hb);
do $$
declare g public.chess_games;
begin
  if not public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot did not join after 2 minutes'; end if;
  select * into g from public.chess_games where code = (select code from tests_hb);
  if g.status <> 'live' or not g.vs_bot or g.opponent_id <> '00000000-0000-4000-8000-00000000b075' then raise exception 'FAIL: the game should be live against the bot'; end if;
  if (select balance_units from public.profiles where id = '00000000-0000-4000-8000-00000000b075') <> 19 then raise exception 'FAIL: the bot did not pay its stake'; end if;
end $$;

-- only one request computes the bot's move; the bot never moves on the human's turn
update public.chess_games set white_id = '00000000-0000-4000-8000-00000000b075' where code = (select code from tests_hb);
do $$ begin
  if not public.chess_bot_claim((select code from tests_hb)) then raise exception 'FAIL: the bot could not claim its turn'; end if;
  if public.chess_bot_claim((select code from tests_hb)) then raise exception 'FAIL: two requests claimed the same bot move'; end if;
  perform public.chess_apply_move((select code from tests_hb), '00000000-0000-4000-8000-00000000b075', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'e4', 'e2', 'e4', null);
  if public.chess_bot_claim((select code from tests_hb)) then raise exception 'FAIL: the bot claimed a move on the human''s turn'; end if;
end $$;

-- the human checkmates the bot: paid from the house bank; the bot has lost 1
update public.chess_games set white_id = '11111111-0000-0000-0000-0000000000a1' where code = (select code from tests_hb);
do $$
declare cur text := (select fen from public.chess_games where code = (select code from tests_hb)); b0 numeric := (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1');
begin
  update public.chess_games set fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' where code = (select code from tests_hb);
  perform public.chess_apply_move((select code from tests_hb), '11111111-0000-0000-0000-0000000000a1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', '4k3/8/8/8/8/8/8/R3K2R b - - 0 9', 'Qxf7#', 'd1', 'f7', 'checkmate');
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> b0 + 1.9 then raise exception 'FAIL: the player was not paid stake + 90%% by the house bank'; end if;
  if (select paused_at from public.house_bot_settings) is not null then raise exception 'FAIL: the bot paused after only one loss'; end if;
end $$;

-- a second game, a second loss in a row: the bot pauses itself and stops accepting
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
delete from tests_hb;
insert into tests_hb (code) select public.chess_create(1, true);
reset role;
update public.chess_games set created_at = now() - interval '3 minutes' where code = (select code from tests_hb);
do $$ begin
  if not public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot should still accept the second game'; end if;
end $$;
update public.chess_games set white_id = '11111111-0000-0000-0000-0000000000a1' where code = (select code from tests_hb);
do $$ begin
  perform public.chess_apply_move((select code from tests_hb), '11111111-0000-0000-0000-0000000000a1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', '4k3/8/8/8/8/8/8/R3K2R b - - 0 9', 'Qxf7#', 'd1', 'f7', 'checkmate');
  if (select paused_at from public.house_bot_settings) is null then raise exception 'FAIL: the bot did not pause after 2 losses in a row'; end if;
  if not exists (select 1 from public.notifications where kind = 'house_bot_paused') and exists (select 1 from public.profiles where is_admin) then raise exception 'FAIL: the admin was not told'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
delete from tests_hb;
insert into tests_hb (code) select public.chess_create(1, true);
reset role;
update public.chess_games set created_at = now() - interval '3 minutes' where code = (select code from tests_hb);
do $$ begin
  if public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: a paused bot accepted a game'; end if;
end $$;

-- resumed, but the daily loss limit still protects the bank
update public.house_bot_settings set paused_at = null, paused_reason = null, daily_loss_limit_units = 2;
do $$ begin
  if public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot ignored its daily loss limit'; end if;
end $$;
update public.house_bot_settings set daily_loss_limit_units = 50;
-- it joins; then the BOT runs out of time: the game is a draw and both stakes come back
do $$
declare b0 numeric := (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1');
begin
  if not public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot should join again after the limit was raised'; end if;
  update public.chess_games set white_id = '00000000-0000-4000-8000-00000000b075', turn_deadline = now() - interval '1 second' where code = (select code from tests_hb);
  perform public.settle_due_chess();
  if (select result from public.chess_games where code = (select code from tests_hb)) <> 'draw' then raise exception 'FAIL: when the bot runs out of time the game must be a draw, not a win for the player'; end if;
  if (select balance_units from public.profiles where id = '11111111-0000-0000-0000-0000000000a1') <> b0 + 1 then raise exception 'FAIL: the draw did not return the player''s stake'; end if;
  if (select paused_at from public.house_bot_settings) is not null then raise exception 'FAIL: a draw must not count as a loss'; end if;
end $$;

-- each player may play the bot only 3 times a day (3 games so far today for a1); a stake above the limit is refused for everybody
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a1', false) \g /dev/null
delete from tests_hb;
insert into tests_hb (code) select public.chess_create(1, true);
reset role;
update public.chess_games set created_at = now() - interval '3 minutes' where code = (select code from tests_hb);
do $$ begin
  if public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot played one player more than 3 times a day'; end if;
end $$;
update public.chess_games set expires_at = now() - interval '1 minute' where code = (select code from tests_hb);
select public.settle_due_chess() \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000a2', false) \g /dev/null
delete from tests_hb;
insert into tests_hb (code) select public.chess_create(2, true);
reset role;
update public.chess_games set created_at = now() - interval '3 minutes' where code = (select code from tests_hb);
do $$ begin
  if public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot accepted a stake above its limit'; end if;
end $$;
-- a game that is not open to anyone is never offered to the bot
update public.chess_games set open_to_all = false where code = (select code from tests_hb);
update public.house_bot_settings set max_stake_units = 5;
do $$ begin
  if public.chess_bot_join((select code from tests_hb)) then raise exception 'FAIL: the bot joined a private game'; end if;
  raise notice 'ok  house bot: off by default, 2 minute wait, open games only, stake/day/loss limits, pauses after 2 losses, bot timeout = draw';
end $$;
update public.chess_games set expires_at = now() - interval '1 minute' where code = (select code from tests_hb);
select public.settle_due_chess() \g /dev/null
update public.house_bot_settings set enabled = false, max_stake_units = 1;
drop table tests_hb;

-- =====================================================================
-- Sync on demand (0062)
-- =====================================================================
do $$
begin
  if has_table_privilege('authenticated', 'public.app_sync_state', 'select') or has_table_privilege('anon', 'public.app_sync_state', 'update') then
    raise exception 'FAIL: players can read or change the sync state';
  end if;
  if has_function_privilege('authenticated', 'public.sync_try_claim(int)', 'execute') or has_function_privilege('anon', 'public.sync_try_claim(int)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_mark_ran()', 'execute') then
    raise exception 'FAIL: players can trigger the match sync claim';
  end if;
  if not public.sync_try_claim(1500) then raise exception 'FAIL: the first claim should win'; end if;
  if public.sync_try_claim(1500) then raise exception 'FAIL: a second claim right after should lose'; end if;
  update public.app_sync_state set last_run_at = now() - interval '26 minutes';
  if not public.sync_try_claim(1500) then raise exception 'FAIL: after 26 minutes a claim should win again'; end if;
  perform public.sync_mark_ran();
  if public.sync_try_claim(1500) then raise exception 'FAIL: a cron run should count as a recent sync'; end if;
  raise notice 'ok  sync on demand: one claim per 25 minutes, server only';
end $$;

\echo 'ALL DATABASE SECURITY TESTS PASSED'
