-- =====================================================================
-- 0050: Crowd picks on every match card (Dashboard and challenges)
--   get_matches_crowd(match ids) returns, per match, how many main-pool slip
--   picks there are and the home / draw / away split.
--   Same rules as get_round_crowd (0033):
--     * the split is shown to Premium players before kickoff, and to every
--       logged-in player once the match (or its round) has started;
--     * at least 5 picks are needed, so nobody's own pick can be worked out.
--   Before that, only the number of picks is returned (percentages null).
-- Safe to re-run.
-- =====================================================================
create or replace function public.get_matches_crowd(p_match_ids bigint[])
returns table (match_id bigint, picks bigint, home_pct numeric, draw_pct numeric, away_pct numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_premium boolean;
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  if p_match_ids is null or cardinality(p_match_ids) = 0 then return; end if;
  if cardinality(p_match_ids) > 400 then raise exception 'too many matches'; end if;
  v_premium := public.is_premium(auth.uid());
  return query
  with t as (
    select sp.match_id mid, count(*) n,
           count(*) filter (where sp.home > sp.away) h,
           count(*) filter (where sp.home = sp.away) d,
           count(*) filter (where sp.home < sp.away) a
      from public.slip_picks sp
     where sp.match_id = any (p_match_ids)
     group by sp.match_id
  )
  select t.mid, t.n,
         case when t.n >= 5 and (v_premium or o.started) then round(100.0 * t.h / t.n) end,
         case when t.n >= 5 and (v_premium or o.started) then round(100.0 * t.d / t.n) end,
         case when t.n >= 5 and (v_premium or o.started) then round(100.0 * t.a / t.n) end
    from t
    join public.matches m on m.id = t.mid
    cross join lateral (
      select (coalesce(public.round_lock_at(m.round_id), m.kickoff_at) <= now() or m.status <> 'scheduled') as started
    ) o;
end $$;
revoke execute on function public.get_matches_crowd(bigint[]) from public, anon;
grant  execute on function public.get_matches_crowd(bigint[]) to authenticated;
