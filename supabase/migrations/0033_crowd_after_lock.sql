-- =====================================================================
-- 0033: Crowd picks (home / draw / away %, most picked score) become free
-- for every logged-in player once a round locks. Before the lock they stay
-- Premium-only (and still need 5+ slips). Safe to re-run.
-- =====================================================================
-- Crowd picks: Premium while the round is open; everyone once it has locked.
create or replace function public.get_round_crowd(p_round_id bigint)
returns table (match_id bigint, slips bigint, home_pct numeric, draw_pct numeric, away_pct numeric, top_score text, top_score_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  if not public.is_premium(auth.uid())
     and coalesce(public.round_lock_at(p_round_id) > now(), true)
     and (select r2.status from public.rounds r2 where r2.id = p_round_id) = 'open' then
    raise exception 'premium only';
  end if;
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

revoke execute on function public.get_round_crowd(bigint) from public, anon;
grant  execute on function public.get_round_crowd(bigint) to authenticated;
