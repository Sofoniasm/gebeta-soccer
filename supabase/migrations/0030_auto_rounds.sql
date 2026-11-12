-- =====================================================================
-- 0030: Automatic daily rounds in Ethiopian time (EAT), Superbru style.
--   Every match sync creates up to three rounds a day by itself:
--     Morning 10  kickoffs 06:00-11:59 EAT
--     Evening 10  kickoffs 12:00-18:59 EAT
--     Night 10    kickoffs 19:00-23:59 EAT
--   A slot only gets a round when it has 10 matches; matches never mix slots.
--   One round per slot per day (enforced here, so no duplicates).
--   get_round_winners: for logged-in players, who won settled rounds and how much.
-- Safe to re-run.
-- =====================================================================
alter table public.rounds add column if not exists auto_slot text check (auto_slot in ('morning', 'evening', 'night'));
alter table public.rounds add column if not exists auto_date date;
create unique index if not exists rounds_auto_slot_uq on public.rounds (auto_date, auto_slot) where auto_slot is not null;

-- Winners of settled rounds (paid slips only), for the Dashboard and Results.
create or replace function public.get_round_winners(p_round_ids bigint[])
returns table (round_id bigint, username text, slip_no int, units numeric, points numeric)
language sql stable security definer set search_path = public as $$
  select l.round_id, pr.username, s.slip_no, sum(l.amount_units),
         (select coalesce(sum(sp.points_earned), 0) from public.slip_picks sp where sp.slip_id = s.id) + s.slam_points
    from public.wallet_ledger l
    join public.rounds r on r.id = l.round_id and r.status = 'settled'
    join public.slips s on s.id = l.slip_id
    join public.profiles pr on pr.id = s.user_id
   where l.kind = 'payout' and l.round_id = any (p_round_ids)
   group by l.round_id, pr.username, s.id, s.slip_no, s.slam_points
   order by l.round_id, sum(l.amount_units) desc;
$$;
revoke execute on function public.get_round_winners(bigint[]) from public, anon;
grant  execute on function public.get_round_winners(bigint[]) to authenticated;
