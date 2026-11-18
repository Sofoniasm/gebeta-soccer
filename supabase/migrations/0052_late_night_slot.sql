-- =====================================================================
-- 0052: "Late night" automatic rounds (00:00-06:00 Ethiopian time)
--   Brazilian / South American games kick off at 01:30-03:30 EAT and
--   belonged to no time slot, so they never got a round. rounds.auto_slot
--   may now also be 'late'. Still one automatic round per slot per day
--   (unique index from 0030).
-- Safe to re-run.
-- =====================================================================
alter table public.rounds drop constraint if exists rounds_auto_slot_check;
alter table public.rounds add constraint rounds_auto_slot_check
  check (auto_slot is null or auto_slot in ('late', 'morning', 'evening', 'night'));
