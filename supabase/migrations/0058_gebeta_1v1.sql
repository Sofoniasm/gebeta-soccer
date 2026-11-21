-- =====================================================================
-- 0058: Gebeta 1 vs 1 — the Ethiopian seed-sowing board game, two players, one stake each.
--   Six pits each, four seeds per pit, one store each. Pick a pit, the seeds are dropped one by one
--   counter-clockwise (your opponent's store is skipped). Last seed in your store = go again. Last seed in an
--   empty pit of yours with seeds opposite = you capture them all. When one side is empty the other player keeps
--   the seeds left on their side; most seeds wins. 60 seconds per move; running out of time loses.
--   Winner: stake back + 90% of the opponent's stake (same fair-fee maths). A draw returns both stakes.
-- Every move is checked and played by the database; money moves only as wallet_ledger rows.
-- =====================================================================

create table if not exists public.gebeta_games (
  id            bigint generated always as identity primary key,
  code          text not null unique,
  creator_id    uuid not null references public.profiles (id) on delete restrict,
  opponent_id   uuid references public.profiles (id) on delete restrict,
  stake_units   numeric(12,2) not null check (stake_units >= 1 and stake_units <= 50),
  fee_pct       numeric(4,3) not null default 0.100 check (fee_pct >= 0 and fee_pct < 1),
  status        text not null default 'open' check (status in ('open', 'live', 'settled', 'cancelled')),
  -- 14 cells: 0-5 creator pits, 6 creator store, 7-12 opponent pits, 13 opponent store
  board         int[] not null default '{4,4,4,4,4,4,0,4,4,4,4,4,4,0}',
  turn          int not null default 1 check (turn in (1, 2)),   -- 1 = creator, 2 = opponent
  turn_deadline timestamptz,
  last_pit      int,           -- the cell index last played (for the screen)
  moves         int not null default 0,
  winner_id     uuid references public.profiles (id),
  result        text check (result in ('score', 'draw', 'timeout', 'resign')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 minutes'),
  started_at    timestamptz,
  settled_at    timestamptz
);
create index if not exists gebeta_games_status_idx on public.gebeta_games (status, expires_at);
create index if not exists gebeta_games_players_idx on public.gebeta_games (creator_id, opponent_id);

alter table public.gebeta_games enable row level security;
revoke all on public.gebeta_games from anon, authenticated;

alter table public.wallet_ledger add column if not exists gebeta_id bigint references public.gebeta_games (id);

create or replace function public.gebeta_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'GB-' || (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.gebeta_games where code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.gebeta_code() from public, anon, authenticated;

-- One move: sow the seeds of pit p_pit (0-5, from the mover's side). Pure board maths.
create or replace function public.gebeta_sow(p_board int[], p_player int, p_pit int, out new_board int[], out again boolean)
language plpgsql immutable set search_path = public as $$
declare
  b         int[] := p_board;
  v_base    int := case when p_player = 1 then 0 else 7 end;
  v_store   int := v_base + 6;
  v_opp_st  int := case when p_player = 1 then 13 else 6 end;
  v_pos     int := v_base + p_pit;
  v_n       int := b[v_base + p_pit + 1];
begin
  b[v_pos + 1] := 0;
  while v_n > 0 loop
    v_pos := (v_pos + 1) % 14;
    if v_pos = v_opp_st then continue; end if;
    b[v_pos + 1] := b[v_pos + 1] + 1;
    v_n := v_n - 1;
  end loop;
  again := v_pos = v_store;
  -- last seed in an empty pit of mine, with seeds opposite: capture both
  if not again and v_pos between v_base and v_base + 5 and b[v_pos + 1] = 1 and b[13 - v_pos] > 0 then
    b[v_store + 1] := b[v_store + 1] + b[13 - v_pos] + 1;
    b[13 - v_pos] := 0;
    b[v_pos + 1] := 0;
  end if;
  new_board := b;
end $$;
revoke all on function public.gebeta_sow(int[], int, int) from public, anon, authenticated;

create or replace function public.gebeta_create(p_stake numeric)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id bigint; v_code text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 50 or p_stake * 4 <> floor(p_stake * 4) then
    raise exception 'stake must be 200 to 10,000 ETB in steps of 50 ETB';
  end if;
  if exists (select 1 from public.gebeta_games where creator_id = v_uid and status = 'open' and expires_at > now()) then
    raise exception 'you already have an open game';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  v_code := public.gebeta_code();
  insert into public.gebeta_games (code, creator_id, stake_units) values (v_code, v_uid, p_stake) returning id into v_id;
  insert into public.wallet_ledger (user_id, amount_units, kind, gebeta_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Gebeta game ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.gebeta_create(numeric) from public, anon;
grant execute on function public.gebeta_create(numeric) to authenticated;

create or replace function public.gebeta_join(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.gebeta_games; v_name text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  select * into r from public.gebeta_games where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'game not found'; end if;
  if r.creator_id = v_uid then raise exception 'you already joined this game'; end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'this game is closed'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  insert into public.wallet_ledger (user_id, amount_units, kind, gebeta_id, reference, created_by)
  values (v_uid, -r.stake_units, 'entry_fee', r.id, 'Gebeta game ' || r.code || ' stake', v_uid);
  update public.gebeta_games
     set opponent_id = v_uid, status = 'live', started_at = now(), turn = 1 + floor(random() * 2)::int, turn_deadline = now() + interval '60 seconds'
   where id = r.id;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.creator_id, 'gebeta_join', '🎲 ' || v_name || ' joined your Gebeta game', 'The game has started: open it now, moves take 60 seconds.', '/gebeta/' || r.code);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.gebeta_join(text) from public, anon;
grant execute on function public.gebeta_join(text) to authenticated;

-- creator cancels a game nobody joined yet
create or replace function public.gebeta_cancel(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.gebeta_games;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.gebeta_games where code = upper(btrim(p_code)) for update;
  if r.id is null or r.creator_id is distinct from v_uid then raise exception 'game not found'; end if;
  if r.status <> 'open' then raise exception 'this game is closed'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, gebeta_id, reference)
  values (r.creator_id, r.stake_units, 'refund', r.id, 'Gebeta game ' || r.code || ' cancelled');
  update public.gebeta_games set status = 'cancelled', settled_at = now() where id = r.id;
end $$;
revoke all on function public.gebeta_cancel(text) from public, anon;
grant execute on function public.gebeta_cancel(text) to authenticated;

-- pays the winner (or returns both stakes on a draw)
create or replace function public.gebeta_finish(p_game bigint, p_winner uuid, p_result text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.gebeta_games; v_each numeric; v_loser uuid;
begin
  select * into r from public.gebeta_games where id = p_game for update;
  if r.id is null or r.status <> 'live' then return; end if;
  if p_winner is null then
    insert into public.wallet_ledger (user_id, amount_units, kind, gebeta_id, reference)
    select u, r.stake_units, 'refund', r.id, 'Gebeta game ' || r.code || ' draw: stakes returned' from unnest(array[r.creator_id, r.opponent_id]) u;
    update public.gebeta_games set status = 'settled', result = 'draw', settled_at = now(), turn_deadline = null where id = r.id;
    insert into public.notifications (user_id, kind, title, body, link)
    select u, 'gebeta_result', '🤝 Gebeta: a draw', 'Equal seeds: both stakes are back in your wallets.', '/gebeta/' || r.code from unnest(array[r.creator_id, r.opponent_id]) u;
    return;
  end if;
  v_loser := case when p_winner = r.creator_id then r.opponent_id else r.creator_id end;
  v_each := public.fair_prize_each(r.stake_units, 2, 1, r.fee_pct);
  insert into public.wallet_ledger (user_id, amount_units, kind, gebeta_id, reference)
  values (p_winner, v_each, 'payout', r.id, 'Gebeta game ' || r.code || ' winnings');
  update public.gebeta_games set status = 'settled', winner_id = p_winner, result = p_result, settled_at = now(), turn_deadline = null where id = r.id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (v_loser, 'gebeta_result', '🎲 Gebeta: you lost',
          case p_result when 'timeout' then 'You ran out of time on a move.' when 'resign' then 'You resigned.' else 'Your opponent had more seeds.' end || ' Rematch?', '/gebeta/' || r.code);
end $$;
revoke all on function public.gebeta_finish(bigint, uuid, text) from public, anon, authenticated;

-- expired open games are refunded; a player who let the 60 seconds run out loses
create or replace function public.gebeta_advance(p_game bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.gebeta_games;
begin
  select * into r from public.gebeta_games where id = p_game for update;
  if r.id is null then return; end if;
  if r.status = 'open' and r.expires_at <= now() then
    insert into public.wallet_ledger (user_id, amount_units, kind, gebeta_id, reference)
    values (r.creator_id, r.stake_units, 'refund', r.id, 'Gebeta game ' || r.code || ' nobody joined');
    update public.gebeta_games set status = 'cancelled', settled_at = now() where id = r.id;
  elsif r.status = 'live' and r.turn_deadline is not null and r.turn_deadline < now() then
    perform public.gebeta_finish(r.id, case when r.turn = 1 then r.opponent_id else r.creator_id end, 'timeout');
  end if;
end $$;
revoke all on function public.gebeta_advance(bigint) from public, anon, authenticated;

create or replace function public.gebeta_move(p_code text, p_pit int)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.gebeta_games;
  v_seat int;
  s     record;
  b     int[];
  v_a   int; v_b int;
  v_win uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_pit is null or p_pit not between 0 and 5 then raise exception 'pick a pit from 1 to 6'; end if;
  select * into r from public.gebeta_games where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'game not found'; end if;
  if r.status <> 'live' then raise exception 'this game is not running'; end if;
  v_seat := case when v_uid = r.creator_id then 1 when v_uid = r.opponent_id then 2 else 0 end;
  if v_seat = 0 then raise exception 'you are not in this game'; end if;
  if r.turn_deadline < now() then
    perform public.gebeta_advance(r.id);   -- too late: the game ends, nothing else to do
    return;
  end if;
  if r.turn <> v_seat then raise exception 'not your turn'; end if;
  if r.board[(case when v_seat = 1 then 0 else 7 end) + p_pit + 1] = 0 then raise exception 'that pit is empty'; end if;

  select * into s from public.gebeta_sow(r.board, v_seat, p_pit);
  b := s.new_board;

  v_a := b[1] + b[2] + b[3] + b[4] + b[5] + b[6];
  v_b := b[8] + b[9] + b[10] + b[11] + b[12] + b[13];
  if v_a = 0 or v_b = 0 then
    b[7] := b[7] + v_a;  b[14] := b[14] + v_b;
    b[1] := 0; b[2] := 0; b[3] := 0; b[4] := 0; b[5] := 0; b[6] := 0;
    b[8] := 0; b[9] := 0; b[10] := 0; b[11] := 0; b[12] := 0; b[13] := 0;
    update public.gebeta_games set board = b, moves = moves + 1, last_pit = (case when v_seat = 1 then 0 else 7 end) + p_pit where id = r.id;
    v_win := case when b[7] > b[14] then r.creator_id when b[14] > b[7] then r.opponent_id else null end;
    perform public.gebeta_finish(r.id, v_win, 'score');
    return;
  end if;

  update public.gebeta_games
     set board = b, moves = moves + 1, last_pit = (case when v_seat = 1 then 0 else 7 end) + p_pit,
         turn = case when s.again then r.turn else 3 - r.turn end, turn_deadline = now() + interval '60 seconds'
   where id = r.id;
end $$;
revoke all on function public.gebeta_move(text, int) from public, anon;
grant execute on function public.gebeta_move(text, int) to authenticated;

create or replace function public.gebeta_resign(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.gebeta_games;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.gebeta_games where code = upper(btrim(p_code)) for update;
  if r.id is null or v_uid not in (r.creator_id, coalesce(r.opponent_id, r.creator_id)) then raise exception 'game not found'; end if;
  if r.status <> 'live' then raise exception 'this game is not running'; end if;
  perform public.gebeta_finish(r.id, case when v_uid = r.creator_id then r.opponent_id else r.creator_id end, 'resign');
end $$;
revoke all on function public.gebeta_resign(text) from public, anon;
grant execute on function public.gebeta_resign(text) to authenticated;

create or replace function public.settle_due_gebeta()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare r record; v_n int := 0; v_s text;
begin
  for r in select id from public.gebeta_games
            where (status = 'open' and expires_at <= now()) or (status = 'live' and turn_deadline < now()) loop
    perform public.gebeta_advance(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.settle_due_gebeta() from public, anon, authenticated;
grant execute on function public.settle_due_gebeta() to service_role;

create or replace function public.gebeta_state(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.gebeta_games;
  v_c   text; v_o text; v_w text;
  v_seat int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.gebeta_games where code = upper(btrim(p_code));
  if r.id is null then return null; end if;
  perform public.gebeta_advance(r.id);
  select * into r from public.gebeta_games where id = r.id;
  select username into v_c from public.profiles where id = r.creator_id;
  select username into v_o from public.profiles where id = r.opponent_id;
  select username into v_w from public.profiles where id = r.winner_id;
  v_seat := case when v_uid = r.creator_id then 1 when v_uid = r.opponent_id then 2 else 0 end;
  return jsonb_build_object(
    'code', r.code, 'status', r.status, 'stake_units', r.stake_units, 'fee_pct', r.fee_pct,
    'creator', v_c, 'opponent', v_o, 'my_seat', v_seat, 'turn', r.turn,
    'board', to_jsonb(r.board), 'last_pit', r.last_pit, 'moves', r.moves,
    'ms_left', case when r.status = 'live' then greatest(0, floor(extract(epoch from (r.turn_deadline - clock_timestamp())) * 1000))::bigint end,
    'expires_in_s', greatest(0, floor(extract(epoch from (r.expires_at - now()))))::int,
    'winner', v_w, 'result', r.result, 'i_won', r.winner_id = v_uid);
end $$;
revoke all on function public.gebeta_state(text) from public, anon;
grant execute on function public.gebeta_state(text) to authenticated;

create or replace function public.gebeta_my_games()
returns table (code text, status text, stake_units numeric, creator text, opponent text, i_won boolean, result text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.code, g.status, g.stake_units, c.username, o.username, g.winner_id = auth.uid(), g.result, g.created_at
    from public.gebeta_games g
    join public.profiles c on c.id = g.creator_id
    left join public.profiles o on o.id = g.opponent_id
   where auth.uid() in (g.creator_id, g.opponent_id) and g.created_at > now() - interval '30 days'
   order by g.created_at desc
   limit 30;
$$;
revoke all on function public.gebeta_my_games() from public, anon;
grant execute on function public.gebeta_my_games() to authenticated;

-- ---------------------------------------------------------- wallet notifications know about Gebeta games
create or replace function public.notify_ledger_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bal   numeric;
  v_amt   text := public.fmt_units(new.amount_units) || ' Unit' ||
                  case when abs(new.amount_units) = 1 then '' else 's' end ||
                  ' (' || public.fmt_etb(new.amount_units) || ' ETB)';
  v_title text;
  v_body  text;
  v_link  text := '/wallet';
  v_push  boolean := true;
  v_round text;
  v_slip  text;
  v_ch    public.challenges;
begin
  select balance_units into v_bal from public.profiles where id = new.user_id;
  if new.gebeta_id is not null then
    select 'Gebeta game ' || code into v_round from public.gebeta_games where id = new.gebeta_id;
    v_link := '/gebeta/' || substr(v_round, 13);
  elsif new.survivor_id is not null then
    select 'Survivor pool ' || code into v_round from public.survivor_pools where id = new.survivor_id;
    v_link := '/survivor/' || substr(v_round, 15);
  elsif new.royale_id is not null then
    select 'Quiz Royale ' || code into v_round from public.royale_rooms where id = new.royale_id;
    v_link := '/royale/' || substr(v_round, 13);
  elsif new.challenge_id is not null then
    select * into v_ch from public.challenges where id = new.challenge_id;
    v_round := 'challenge “' || v_ch.title || '”';
    v_link  := '/challenges/' || v_ch.code;
  elsif new.league_id is not null then
    select 'league “' || name || '”' into v_round from public.leagues where id = new.league_id;
  else
    select coalesce(nullif(trim(name), ''), 'Round ' || id) into v_round from public.rounds where id = new.round_id;
  end if;
  if new.slip_id is not null then
    select 'Slip #' || slip_no into v_slip from public.slips where id = new.slip_id;
  end if;

  if new.kind = 'deposit' then
    v_title := '💰 Deposit received';
    v_body  := '+' || v_amt || ' added to your wallet.';
  elsif new.kind = 'payout' then
    v_title := '🏆 You won!';
    v_body  := '+' || v_amt || ' from ' || coalesce(v_round, 'your round') || coalesce(' (' || v_slip || ')', '') || '. Congratulations!';
    if new.challenge_id is null and new.royale_id is null and new.survivor_id is null and new.gebeta_id is null then
      v_link := case when new.league_id is not null then '/leagues' else '/results' end;
    end if;
  elsif new.kind = 'commission' then
    v_title := '🤝 Sales commission';
    v_body  := '+' || v_amt || ' from a player you invited (' ||
               coalesce(nullif(replace(new.reference, 'Sales commission · ', ''), ''), 'a game') || '). Thank you!';
    v_link  := '/sales';
    v_push  := false;
  elsif new.kind = 'refund' and new.reference like 'Withdrawal #% rejected' then
    v_title := '❌ ' || replace(new.reference, ' rejected', ' not sent');
    v_body  := '+' || v_amt || ' returned to your wallet.';
  elsif new.kind = 'refund' and new.reference like '%nobody else joined%' then
    v_title := '↩️ Stake refunded · ' || coalesce(v_round, 'your round') || coalesce(' (' || v_slip || ')', '');
    v_body  := 'Nobody else joined, so your stake was refunded in full: +' || v_amt || '.';
  elsif new.kind = 'refund' then
    v_title := '↩️ Units returned';
    v_body  := '+' || v_amt || ' back in your wallet' || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'adjustment' then
    v_title := case when new.amount_units > 0 then '➕ Units added' else '➖ Units deducted' end;
    v_body  := case when new.amount_units > 0 then '+' else '−' end || v_amt || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'entry_fee' and new.gebeta_id is not null then
    v_title := '🎲 Stake locked: ' || v_round;
    v_body  := v_amt || ' stake locked. Win the game to take your stake back + 90% of your opponent''s stake.';
    v_push  := false;
  elsif new.kind = 'entry_fee' and new.survivor_id is not null then
    v_title := '🛡️ You''re in: ' || v_round;
    v_body  := v_amt || ' stake locked. Pick one team to win each match day: if it doesn''t win, you''re out. The last one standing wins the pot.';
    v_push  := false;
  elsif new.kind = 'entry_fee' and new.royale_id is not null then
    v_title := '🧠 You''re in: ' || v_round;
    v_body  := v_amt || ' stake locked. The creator starts the game when enough players have joined.';
    v_push  := false;
  elsif new.kind = 'entry_fee' and new.challenge_id is not null then
    v_title := '🤝 You''re in: ' || v_round;
    v_body  := v_amt || ' stake locked. You can change your scores until the first kickoff.';
    v_push  := new.created_by is distinct from new.user_id;
  elsif new.kind = 'entry_fee' then
    v_title := case when v_slip is not null then '🎟️ ' || v_slip || ' placed · ' || coalesce(v_round, 'the round')
                    else '⚽ You joined ' || coalesce(v_round, 'the round') end;
    v_body  := v_amt || ' paid. You can edit your picks until the first kickoff. Good luck!';
    v_link  := case when new.league_id is not null then '/leagues' else '/dashboard' end;
    v_push  := new.created_by is distinct from new.user_id;
  elsif new.kind = 'withdrawal' then
    v_title := '⏳ Withdrawal requested';
    v_body  := v_amt || ' is on hold for you. We''ll send it to your Telebirr soon.';
    v_push  := false;
  else
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, push)
  values (new.user_id, new.kind, v_title, v_body || ' Balance: ' || public.fmt_units(coalesce(v_bal, 0)) || ' Units.', v_link, v_push);
  return new;
end $$;
revoke execute on function public.notify_ledger_entry() from public, anon, authenticated;

notify pgrst, 'reload schema';
