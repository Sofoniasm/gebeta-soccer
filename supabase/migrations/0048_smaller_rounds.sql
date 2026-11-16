-- =====================================================================
-- 0048: Rounds of 5 to 10 matches (was exactly 10)
--   * A round can still hold at most 10 matches (0018).
--   * A round can now be OPENED with 5 to 10 matches.
--   * A slip needs a score for EVERY match of its round (5 to 10).
--   Prize rules are unchanged: the winning bar is already "more than half
--   of 3 points x finished matches", and Slam Points keep the same limits
--   (5-7 correct +1, 8-9 +2, all 10 +3).
--   Rounds that already exist (10 matches) work exactly as before.
-- Safe to re-run.
-- =====================================================================

create or replace function public.check_round_open() returns trigger
language plpgsql as $$
declare v_n int;
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    select count(*) into v_n from public.matches where round_id = new.id;
    if v_n < 5 or v_n > 10 then
      raise exception 'a round needs 5 to 10 matches to open (it has %)', v_n;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.check_round_open() from public, anon, authenticated;

create or replace function public.validate_slip_picks(p_round_id bigint, p_picks jsonb)
returns table (match_id bigint, home smallint, away smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_need int;
  v_got  int;
begin
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'picks must be a list'; end if;
  select count(*) into v_need from public.matches where round_id = p_round_id;
  if v_need < 5 or v_need > 10 then raise exception 'round does not have 5 to 10 matches'; end if;

  select count(distinct (x ->> 'match_id')::bigint) into v_got
    from jsonb_array_elements(p_picks) x
    join public.matches m on m.id = (x ->> 'match_id')::bigint and m.round_id = p_round_id
   where (x ->> 'home') ~ '^\d{1,2}$' and (x ->> 'away') ~ '^\d{1,2}$'
     and (x ->> 'home')::int between 0 and 20 and (x ->> 'away')::int between 0 and 20;
  if v_got <> v_need or jsonb_array_length(p_picks) <> v_need then
    raise exception 'a slip needs a score for all % matches', v_need;
  end if;

  return query
    select (x ->> 'match_id')::bigint, (x ->> 'home')::smallint, (x ->> 'away')::smallint
      from jsonb_array_elements(p_picks) x;
end $$;
revoke execute on function public.validate_slip_picks(bigint, jsonb) from public, anon, authenticated;
