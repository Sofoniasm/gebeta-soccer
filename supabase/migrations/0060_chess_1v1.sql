-- =====================================================================
-- 0060: Chess 1 vs 1 — two players, one stake each.
--   Full chess rules (castling, en passant, promotion, check, checkmate, stalemate, repetition, 50 moves) are
--   checked on the server with the chess.js library, never in the browser. The database keeps the position,
--   the clock and the money: a move is only accepted from the player whose turn it is, on the position the server
--   checked, and only the server (service_role) can write it. 2 minutes per move; running out of time loses.
--   Winner: stake back + 90% of the opponent's stake. A draw returns both stakes.
-- Money moves only as wallet_ledger rows.
-- =====================================================================

create table if not exists public.chess_games (
  id            bigint generated always as identity primary key,
  code          text not null unique,
  creator_id    uuid not null references public.profiles (id) on delete restrict,
  opponent_id   uuid references public.profiles (id) on delete restrict,
  white_id      uuid references public.profiles (id) on delete restrict,   -- set when the opponent joins (random colours)
  stake_units   numeric(12,2) not null check (stake_units >= 1 and stake_units <= 50),
  fee_pct       numeric(4,3) not null default 0.100 check (fee_pct >= 0 and fee_pct < 1),
  status        text not null default 'open' check (status in ('open', 'live', 'settled', 'cancelled')),
  fen           text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  san_moves     text[] not null default '{}',
  last_from     text,
  last_to       text,
  turn_deadline timestamptz,
  winner_id     uuid references public.profiles (id),
  result        text check (result in ('checkmate', 'draw', 'timeout', 'resign')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 minutes'),
  started_at    timestamptz,
  settled_at    timestamptz
);
create index if not exists chess_games_status_idx on public.chess_games (status, expires_at);
create index if not exists chess_games_players_idx on public.chess_games (creator_id, opponent_id);

alter table public.chess_games enable row level security;
revoke all on public.chess_games from anon, authenticated;

alter table public.wallet_ledger add column if not exists chess_id bigint references public.chess_games (id);

create or replace function public.chess_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'CH-' || (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.chess_games where code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.chess_code() from public, anon, authenticated;

create or replace function public.chess_create(p_stake numeric)
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
  if exists (select 1 from public.chess_games where creator_id = v_uid and status = 'open' and expires_at > now()) then
    raise exception 'you already have an open game';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  v_code := public.chess_code();
  insert into public.chess_games (code, creator_id, stake_units) values (v_code, v_uid, p_stake) returning id into v_id;
  insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Chess game ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.chess_create(numeric) from public, anon;
grant execute on function public.chess_create(numeric) to authenticated;

create or replace function public.chess_join(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.chess_games; v_name text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  select * into r from public.chess_games where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'game not found'; end if;
  if r.creator_id = v_uid then raise exception 'you already joined this game'; end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'this game is closed'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference, created_by)
  values (v_uid, -r.stake_units, 'entry_fee', r.id, 'Chess game ' || r.code || ' stake', v_uid);
  update public.chess_games
     set opponent_id = v_uid, status = 'live', started_at = now(),
         white_id = case when random() < 0.5 then r.creator_id else v_uid end,
         turn_deadline = now() + interval '120 seconds'
   where id = r.id;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.creator_id, 'chess_join', '♞ ' || v_name || ' joined your Chess game', 'The game has started: open it now, moves take 2 minutes.', '/chess/' || r.code);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.chess_join(text) from public, anon;
grant execute on function public.chess_join(text) to authenticated;

create or replace function public.chess_cancel(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.chess_games;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.chess_games where code = upper(btrim(p_code)) for update;
  if r.id is null or r.creator_id is distinct from v_uid then raise exception 'game not found'; end if;
  if r.status <> 'open' then raise exception 'this game is closed'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference)
  values (r.creator_id, r.stake_units, 'refund', r.id, 'Chess game ' || r.code || ' cancelled');
  update public.chess_games set status = 'cancelled', settled_at = now() where id = r.id;
end $$;
revoke all on function public.chess_cancel(text) from public, anon;
grant execute on function public.chess_cancel(text) to authenticated;

create or replace function public.chess_finish(p_game bigint, p_winner uuid, p_result text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.chess_games; v_each numeric; v_loser uuid;
begin
  select * into r from public.chess_games where id = p_game for update;
  if r.id is null or r.status <> 'live' then return; end if;
  if p_winner is null then
    insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference)
    select u, r.stake_units, 'refund', r.id, 'Chess game ' || r.code || ' draw: stakes returned' from unnest(array[r.creator_id, r.opponent_id]) u;
    update public.chess_games set status = 'settled', result = 'draw', settled_at = now(), turn_deadline = null where id = r.id;
    insert into public.notifications (user_id, kind, title, body, link)
    select u, 'chess_result', '🤝 Chess: a draw', 'Both stakes are back in your wallets.', '/chess/' || r.code from unnest(array[r.creator_id, r.opponent_id]) u;
    return;
  end if;
  v_loser := case when p_winner = r.creator_id then r.opponent_id else r.creator_id end;
  v_each := public.fair_prize_each(r.stake_units, 2, 1, r.fee_pct);
  insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference)
  values (p_winner, v_each, 'payout', r.id, 'Chess game ' || r.code || ' winnings');
  update public.chess_games set status = 'settled', winner_id = p_winner, result = p_result, settled_at = now(), turn_deadline = null where id = r.id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (v_loser, 'chess_result', '♞ Chess: you lost',
          case p_result when 'timeout' then 'You ran out of time on a move.' when 'resign' then 'You resigned.' else 'Checkmate.' end || ' Rematch?', '/chess/' || r.code);
end $$;
revoke all on function public.chess_finish(bigint, uuid, text) from public, anon, authenticated;

create or replace function public.chess_advance(p_game bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.chess_games; v_white_to_move boolean;
begin
  select * into r from public.chess_games where id = p_game for update;
  if r.id is null then return; end if;
  if r.status = 'open' and r.expires_at <= now() then
    insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference)
    values (r.creator_id, r.stake_units, 'refund', r.id, 'Chess game ' || r.code || ' nobody joined');
    update public.chess_games set status = 'cancelled', settled_at = now() where id = r.id;
  elsif r.status = 'live' and r.turn_deadline is not null and r.turn_deadline < now() then
    v_white_to_move := split_part(r.fen, ' ', 2) = 'w';
    -- the player whose turn it is ran out of time: the other one wins
    perform public.chess_finish(r.id,
      case when v_white_to_move then (case when r.white_id = r.creator_id then r.opponent_id else r.creator_id end) else r.white_id end,
      'timeout');
  end if;
end $$;
revoke all on function public.chess_advance(bigint) from public, anon, authenticated;

-- The server (after chess.js has checked the move) writes it here. Only service_role can call this.
create or replace function public.chess_apply_move(p_code text, p_user uuid, p_expected_fen text, p_new_fen text, p_san text, p_from text, p_to text, p_outcome text)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare r public.chess_games; v_white_to_move boolean; v_mover uuid;
begin
  select * into r from public.chess_games where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'game not found'; end if;
  if r.status <> 'live' then raise exception 'this game is not running'; end if;
  if r.turn_deadline < now() then
    perform public.chess_advance(r.id);
    return 'timeout';
  end if;
  if r.fen <> p_expected_fen then raise exception 'the position changed'; end if;
  v_white_to_move := split_part(r.fen, ' ', 2) = 'w';
  v_mover := case when v_white_to_move then r.white_id else (case when r.white_id = r.creator_id then r.opponent_id else r.creator_id end) end;
  if v_mover is distinct from p_user then raise exception 'not your turn'; end if;
  if p_new_fen is null or length(p_new_fen) not between 10 and 100 or p_san is null or length(p_san) > 12 then raise exception 'illegal move'; end if;
  if p_from !~ '^[a-h][1-8]$' or p_to !~ '^[a-h][1-8]$' then raise exception 'illegal move'; end if;

  update public.chess_games
     set fen = p_new_fen, san_moves = san_moves || p_san, last_from = p_from, last_to = p_to,
         turn_deadline = now() + interval '120 seconds'
   where id = r.id;
  if p_outcome = 'checkmate' then
    perform public.chess_finish(r.id, p_user, 'checkmate');
    return 'checkmate';
  elsif p_outcome = 'draw' then
    perform public.chess_finish(r.id, null, 'draw');
    return 'draw';
  end if;
  return 'ok';
end $$;
revoke all on function public.chess_apply_move(text, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.chess_apply_move(text, uuid, text, text, text, text, text, text) to service_role;

create or replace function public.chess_resign(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.chess_games;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.chess_games where code = upper(btrim(p_code)) for update;
  if r.id is null or v_uid not in (r.creator_id, coalesce(r.opponent_id, r.creator_id)) then raise exception 'game not found'; end if;
  if r.status <> 'live' then raise exception 'this game is not running'; end if;
  perform public.chess_finish(r.id, case when v_uid = r.creator_id then r.opponent_id else r.creator_id end, 'resign');
end $$;
revoke all on function public.chess_resign(text) from public, anon;
grant execute on function public.chess_resign(text) to authenticated;

create or replace function public.settle_due_chess()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in select id from public.chess_games
            where (status = 'open' and expires_at <= now()) or (status = 'live' and turn_deadline < now()) loop
    perform public.chess_advance(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.settle_due_chess() from public, anon, authenticated;
grant execute on function public.settle_due_chess() to service_role;

create or replace function public.chess_state(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.chess_games;
  v_c   text; v_o text; v_w text;
  v_seat int;
  v_color text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.chess_games where code = upper(btrim(p_code));
  if r.id is null then return null; end if;
  perform public.chess_advance(r.id);
  select * into r from public.chess_games where id = r.id;
  select username into v_c from public.profiles where id = r.creator_id;
  select username into v_o from public.profiles where id = r.opponent_id;
  select username into v_w from public.profiles where id = r.winner_id;
  v_seat := case when v_uid = r.creator_id then 1 when v_uid = r.opponent_id then 2 else 0 end;
  v_color := case when v_seat = 0 or r.white_id is null then null when r.white_id = v_uid then 'w' else 'b' end;
  return jsonb_build_object(
    'code', r.code, 'status', r.status, 'stake_units', r.stake_units, 'fee_pct', r.fee_pct,
    'creator', v_c, 'opponent', v_o, 'my_seat', v_seat, 'my_color', v_color,
    'white', case when r.white_id is null then null when r.white_id = r.creator_id then v_c else v_o end,
    'fen', r.fen, 'turn', split_part(r.fen, ' ', 2), 'san_moves', to_jsonb(r.san_moves), 'last_from', r.last_from, 'last_to', r.last_to,
    'ms_left', case when r.status = 'live' then greatest(0, floor(extract(epoch from (r.turn_deadline - clock_timestamp())) * 1000))::bigint end,
    'expires_in_s', greatest(0, floor(extract(epoch from (r.expires_at - now()))))::int,
    'winner', v_w, 'result', r.result, 'i_won', r.winner_id = v_uid);
end $$;
revoke all on function public.chess_state(text) from public, anon;
grant execute on function public.chess_state(text) to authenticated;

create or replace function public.chess_my_games()
returns table (code text, status text, stake_units numeric, creator text, opponent text, i_won boolean, result text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.code, g.status, g.stake_units, c.username, o.username, g.winner_id = auth.uid(), g.result, g.created_at
    from public.chess_games g
    join public.profiles c on c.id = g.creator_id
    left join public.profiles o on o.id = g.opponent_id
   where auth.uid() in (g.creator_id, g.opponent_id) and g.created_at > now() - interval '30 days'
   order by g.created_at desc
   limit 30;
$$;
revoke all on function public.chess_my_games() from public, anon;
grant execute on function public.chess_my_games() to authenticated;

-- ---------------------------------------------------------- wallet notifications know about Chess games
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
  if new.chess_id is not null then
    select 'Chess game ' || code into v_round from public.chess_games where id = new.chess_id;
    v_link := '/chess/' || substr(v_round, 12);
  elsif new.dama_id is not null then
    select 'Dama game ' || code into v_round from public.dama_games where id = new.dama_id;
    v_link := '/dama/' || substr(v_round, 11);
  elsif new.gebeta_id is not null then
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
    if new.challenge_id is null and new.royale_id is null and new.survivor_id is null and new.gebeta_id is null and new.dama_id is null and new.chess_id is null then
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
  elsif new.kind = 'entry_fee' and new.chess_id is not null then
    v_title := '♞ Stake locked: ' || v_round;
    v_body  := v_amt || ' stake locked. Win the game to take your stake back + 90% of your opponent''s stake.';
    v_push  := false;
  elsif new.kind = 'entry_fee' and new.dama_id is not null then
    v_title := '♟️ Stake locked: ' || v_round;
    v_body  := v_amt || ' stake locked. Win the game to take your stake back + 90% of your opponent''s stake.';
    v_push  := false;
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
