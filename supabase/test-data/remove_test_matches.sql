-- =====================================================================
-- Cleanup after testing: removes the fake TEST matches that are not in a
-- round. A test round that took real slips stays in the history (money
-- records are never deleted); rename it so players can tell, e.g.:
--   update public.rounds set name = 'Test round (ignore)' where id = <id>;
-- =====================================================================
delete from public.matches where provider = 'test' and round_id is null;

select r.id, r.name, r.status, count(m.id) as test_matches
  from public.rounds r join public.matches m on m.round_id = r.id
 where m.provider = 'test'
 group by r.id, r.name, r.status;
