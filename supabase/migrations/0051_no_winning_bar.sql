-- =====================================================================
-- 0051: No winning bar on main rounds — the best slip always wins.
--   The app (lib/settlement.ts) and the Terms say "there is always a
--   winner: the slip with the most points wins, whatever its score".
--   The database still refused to pay a winning slip with half the match
--   points or fewer ("a winning slip needs more than X match points"),
--   so a low-scoring round could not be settled at all.
--   This is settle_round_slips exactly as in 0049 (fair fee, solo refund,
--   sales commission, payout cap), with only that old check removed.
-- Needs 0049 first. Safe to re-run.
-- =====================================================================

create or replace function public.settle_round_slips(
  p_round_id bigint, p_points jsonb, p_slams jsonb, p_payouts jsonb, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round   public.rounds;
  v_paid    numeric;
  v_players int;
  v_slips   int;
  v_wins    int;
  v_max     numeric;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'round not found'; end if;
  if v_round.status not in ('open', 'locked') then raise exception 'round already %', v_round.status; end if;
  if exists (select 1 from public.matches where round_id = p_round_id and status not in ('finished', 'cancelled', 'postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select count(distinct user_id) into v_players from public.slips where round_id = p_round_id;

  -- Fair fee (0049): each winner = own stake + losers' stakes x (1 - cut) / winners.
  -- The database checks the server's payouts never go above that.
  select count(*) into v_slips from public.slips where round_id = p_round_id;
  select count(*) filter (where (x ->> 'units')::numeric > 0), coalesce(sum((x ->> 'units')::numeric), 0)
    into v_wins, v_paid from jsonb_array_elements(p_payouts) x;
  v_max := public.fair_prize_total(v_round.entry_fee_units, v_slips, v_wins, v_round.house_cut);
  if v_paid > v_max + 0.001 then raise exception 'payouts (%) exceed the prize (%)', v_paid, v_max; end if;
  if v_players = 1 and v_paid > 0 then raise exception 'only one player in this round: refund, no payouts'; end if;
  if exists (select 1 from jsonb_array_elements(p_payouts) x
              where not exists (select 1 from public.slips s where s.id = (x ->> 'slip_id')::bigint and s.round_id = p_round_id)) then
    raise exception 'payout to a slip outside this round';
  end if;

  update public.slip_picks sp set points_earned = (x ->> 'points')::numeric
    from jsonb_array_elements(p_points) x
   where sp.id = (x ->> 'pick_id')::bigint
     and sp.slip_id in (select id from public.slips where round_id = p_round_id);
  update public.slips s set slam_points = (x ->> 'slam_points')::numeric
    from jsonb_array_elements(p_slams) x
   where s.id = (x ->> 'slip_id')::bigint and s.round_id = p_round_id;

  update public.predictions p set points_earned = sp.points_earned
    from public.slip_picks sp join public.slips s on s.id = sp.slip_id
   where s.round_id = p_round_id and s.slip_no = 1 and p.user_id = s.user_id and p.match_id = sp.match_id;
  update public.round_entries e set slam_points = s.slam_points
    from public.slips s where s.round_id = p_round_id and s.slip_no = 1 and e.round_id = p_round_id and e.user_id = s.user_id;

  -- Only one player (any number of slips): every stake back in full, no fee, no winner.
  -- No house cut, so no sales commission either.
  if v_players = 1 then
    insert into public.wallet_ledger (user_id, amount_units, kind, round_id, slip_id, reference, created_by)
    select s.user_id, t.owed, 'refund', p_round_id, s.id,
           'Slip #' || s.slip_no || ': nobody else joined, stake refunded in full', p_admin_id
      from public.slips s
      cross join lateral (
        select -coalesce(sum(l.amount_units) filter (where l.kind = 'entry_fee'), 0)
               - coalesce(sum(l.amount_units) filter (where l.kind = 'refund'), 0) owed
          from public.wallet_ledger l where l.slip_id = s.id
      ) t
     where s.round_id = p_round_id and t.owed > 0
     order by s.slip_no;
    update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
    return;
  end if;

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, slip_id, reference, created_by)
  select s.user_id, (x ->> 'units')::numeric, 'payout', p_round_id, s.id,
         'Slip #' || s.slip_no || ' winnings (Rank ' || coalesce(x ->> 'rank', '1') || ')', p_admin_id
    from jsonb_array_elements(p_payouts) x join public.slips s on s.id = (x ->> 'slip_id')::bigint
   where (x ->> 'units')::numeric > 0;

  -- Sales commission: 5% of the round's NORMAL house cut on each referred
  -- player's stakes (net of any refund). Same even if nobody won.
  -- Every match called off: no commission.
  if exists (select 1 from public.matches where round_id = p_round_id and status = 'finished') then
    perform public.pay_referral_commission(t.user_id, p_round_id, null, t.stake, v_round.house_cut, 0.05,
                                           coalesce(nullif(trim(v_round.name), ''), 'Round ' || v_round.id))
       from (
         select l.user_id, -sum(l.amount_units) stake
           from public.wallet_ledger l
          where l.round_id = p_round_id and l.league_id is null and l.challenge_id is null
            and l.kind in ('entry_fee', 'refund')
          group by l.user_id
       ) t
       join public.profiles pr on pr.id = t.user_id
      where pr.referred_by is not null and t.stake > 0;
  end if;

  update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
end $$;
revoke execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) to service_role;
