-- Public numbers for the landing page ("played by N football fans").
-- Returns only totals — no personal data.
create or replace function public.get_public_stats()
returns table (players bigint, predictions bigint, rounds bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.profiles),
         (select count(*) from public.predictions),
         (select count(*) from public.rounds where status = 'settled');
$$;
grant execute on function public.get_public_stats() to anon, authenticated;
