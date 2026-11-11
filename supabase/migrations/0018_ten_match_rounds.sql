-- =====================================================================
-- GebetaSoccer — every round has exactly 10 matches
--   * New rounds start as a DRAFT (players can't see or join them).
--   * A round can hold at most 10 matches.
--   * A round can only be OPENED with exactly 10 matches.
-- Enforced in the database, so no button or bug can get around it.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create or replace function public.check_round_match_limit() returns trigger
language plpgsql as $$
begin
  if new.round_id is not null and (tg_op = 'INSERT' or new.round_id is distinct from old.round_id) then
    if (select count(*) from public.matches where round_id = new.round_id and id <> new.id) >= 10 then
      raise exception 'a round can have at most 10 matches';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists matches_round_limit on public.matches;
create trigger matches_round_limit
before insert or update of round_id on public.matches
for each row execute function public.check_round_match_limit();

create or replace function public.check_round_open() returns trigger
language plpgsql as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    if (select count(*) from public.matches where round_id = new.id) <> 10 then
      raise exception 'a round needs exactly 10 matches to open (it has %)',
        (select count(*) from public.matches where round_id = new.id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rounds_open_needs_ten on public.rounds;
create trigger rounds_open_needs_ten
before insert or update of status on public.rounds
for each row execute function public.check_round_open();

revoke execute on function public.check_round_match_limit() from public, anon, authenticated;
revoke execute on function public.check_round_open() from public, anon, authenticated;
