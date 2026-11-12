-- =====================================================================
-- TEST ONLY: 10 fake matches so you can try the whole money flow during
-- an international break. Run in the Supabase SQL Editor.
--   * Kickoffs start 45 minutes from now, one minute apart, so you have
--     time to make the round and place a slip before it locks.
--   * League name "TEST" is not one of your leagues, so the automatic
--     Morning/Evening/Night rounds never pick these matches up.
--   * The match sync never touches them (provider = 'test').
-- Remove them afterwards with remove_test_matches.sql.
-- =====================================================================
insert into public.matches (provider, external_id, competition, home_team, away_team, kickoff_at, status)
select 'test', 900000 + g, 'TEST',
       (array['Test Lions','Test Eagles','Test Tigers','Test Bulls','Test Sharks','Test Wolves','Test Falcons','Test Bears','Test Rhinos','Test Cobras'])[g],
       (array['Test Zebras','Test Hawks','Test Panthers','Test Horses','Test Dolphins','Test Foxes','Test Owls','Test Lynx','Test Bison','Test Vipers'])[g],
       now() + interval '45 minutes' + (g - 1) * interval '1 minute',
       'scheduled'
  from generate_series(1, 10) g
on conflict (provider, external_id) do update
  set kickoff_at = excluded.kickoff_at, status = 'scheduled',
      actual_home_score = null, actual_away_score = null, updated_at = now()
  where public.matches.round_id is null;  -- re-running never disturbs a test round already made

select id, home_team, away_team, kickoff_at at time zone 'Africa/Addis_Ababa' as kickoff_eat
  from public.matches where provider = 'test' order by kickoff_at;
