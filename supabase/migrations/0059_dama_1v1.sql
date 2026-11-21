-- =====================================================================
-- 0059: Dama 1 vs 1 — Ethiopian draughts for two players, one stake each.
--   8x8 board, 16 men each on the two rows in front of their own edge. Men move one square forward or sideways
--   (never diagonally, never back). Capture by jumping over an adjacent enemy forward or sideways onto the empty
--   square behind it; you must capture when you can, and keep jumping with the same piece while you can.
--   A man that ends its move on the far row becomes a king: it slides any distance in a straight line and
--   captures by jumping over one enemy piece, landing on any empty square behind it.
--   You win by capturing everything or leaving your opponent without a legal move. 60 non-capturing moves in a
--   row (both players together) = draw. 60 seconds per move; running out of time loses.
--   Winner: stake back + 90% of the opponent's stake. A draw returns both stakes.
-- The database checks and plays every move; money moves only as wallet_ledger rows.
-- =====================================================================

-- cells 0-63, cell = row * 8 + column. 0 empty, 1 = player 1 man, 2 = player 1 king, 3 = player 2 man, 4 = player 2 king.
-- Player 1 (the creator) starts on rows 1-2 and moves toward row 7; player 2 starts on rows 5-6 and moves toward row 0.
create or replace function public.dama_initial_board() returns int[]
language sql immutable set search_path = public as $$
  select array_agg(case when g between 8 and 23 then 1 when g between 40 and 55 then 3 else 0 end order by g) from generate_series(0, 63) g
$$;
revoke all on function public.dama_initial_board() from public, anon, authenticated;

create or replace function public.dama_owner(v int) returns int
language sql immutable as $$ select case when v in (1, 2) then 1 when v in (3, 4) then 2 else 0 end $$;
revoke all on function public.dama_owner(int) from public, anon, authenticated;

create table if not exists public.dama_games (
  id            bigint generated always as identity primary key,
  code          text not null unique,
  creator_id    uuid not null references public.profiles (id) on delete restrict,
  opponent_id   uuid references public.profiles (id) on delete restrict,
  stake_units   numeric(12,2) not null check (stake_units >= 1 and stake_units <= 50),
  fee_pct       numeric(4,3) not null default 0.100 check (fee_pct >= 0 and fee_pct < 1),
  status        text not null default 'open' check (status in ('open', 'live', 'settled', 'cancelled')),
  board         int[] not null default public.dama_initial_board(),
  turn          int not null default 1 check (turn in (1, 2)),
  chain_from    int,            -- the piece that has to keep capturing
  non_capture   int not null default 0,
  turn_deadline timestamptz,
  last_from     int,
  last_to       int,
  moves         int not null default 0,
  winner_id     uuid references public.profiles (id),
  result        text check (result in ('score', 'draw', 'timeout', 'resign')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 minutes'),
  started_at    timestamptz,
  settled_at    timestamptz
);
create index if not exists dama_games_status_idx on public.dama_games (status, expires_at);
create index if not exists dama_games_players_idx on public.dama_games (creator_id, opponent_id);

alter table public.dama_games enable row level security;
revoke all on public.dama_games from anon, authenticated;

alter table public.wallet_ledger add column if not exists dama_id bigint references public.dama_games (id);

create or replace function public.dama_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'DM-' || (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.dama_games where code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.dama_code() from public, anon, authenticated;

-- ---------------------------------------------------------- move generation (pure board maths)
-- captures available to the piece on `p_cell`
create or replace function public.dama_caps(b int[], p_cell int)
returns table (to_cell int, over_cell int)
language plpgsql immutable set search_path = public as $$
declare
  v    int := b[p_cell + 1];
  p    int := public.dama_owner(v);
  king boolean := v in (2, 4);
  fwd  int := case when p = 1 then 1 else -1 end;
  r    int := p_cell / 8;
  c    int := p_cell % 8;
  d    record;
  nr   int; nc int; lr int; lc int;
begin
  if p = 0 then return; end if;
  for d in select * from (values (1, 0), (-1, 0), (0, 1), (0, -1)) t(dr, dc) loop
    if not king and d.dr = -fwd then continue; end if;   -- men never jump backwards
    nr := r + d.dr; nc := c + d.dc;
    if king then
      while nr between 0 and 7 and nc between 0 and 7 and b[nr * 8 + nc + 1] = 0 loop
        nr := nr + d.dr; nc := nc + d.dc;
      end loop;
    end if;
    if nr between 0 and 7 and nc between 0 and 7 and public.dama_owner(b[nr * 8 + nc + 1]) = 3 - p then
      lr := nr + d.dr; lc := nc + d.dc;
      while lr between 0 and 7 and lc between 0 and 7 and b[lr * 8 + lc + 1] = 0 loop
        to_cell := lr * 8 + lc; over_cell := nr * 8 + nc;
        return next;
        exit when not king;
        lr := lr + d.dr; lc := lc + d.dc;
      end loop;
    end if;
  end loop;
end $$;
revoke all on function public.dama_caps(int[], int) from public, anon, authenticated;

-- plain (non-capturing) moves of the piece on `p_cell`
create or replace function public.dama_steps(b int[], p_cell int)
returns table (to_cell int)
language plpgsql immutable set search_path = public as $$
declare
  v    int := b[p_cell + 1];
  p    int := public.dama_owner(v);
  king boolean := v in (2, 4);
  fwd  int := case when p = 1 then 1 else -1 end;
  r    int := p_cell / 8;
  c    int := p_cell % 8;
  d    record;
  nr   int; nc int;
begin
  if p = 0 then return; end if;
  for d in select * from (values (1, 0), (-1, 0), (0, 1), (0, -1)) t(dr, dc) loop
    if not king and d.dr = -fwd then continue; end if;
    nr := r + d.dr; nc := c + d.dc;
    while nr between 0 and 7 and nc between 0 and 7 and b[nr * 8 + nc + 1] = 0 loop
      to_cell := nr * 8 + nc;
      return next;
      exit when not king;
      nr := nr + d.dr; nc := nc + d.dc;
    end loop;
  end loop;
end $$;
revoke all on function public.dama_steps(int[], int) from public, anon, authenticated;

-- every legal move for a player: captures are compulsory; while a capture chain is going only that piece may move
create or replace function public.dama_legal_moves(b int[], p_player int, p_chain int)
returns table (from_cell int, to_cell int, over_cell int, is_cap boolean)
language plpgsql immutable set search_path = public as $$
declare c int; rec record; v_cap boolean := false;
begin
  for c in 0..63 loop
    if public.dama_owner(b[c + 1]) = p_player and (p_chain is null or c = p_chain) then
      for rec in select * from public.dama_caps(b, c) loop
        from_cell := c; to_cell := rec.to_cell; over_cell := rec.over_cell; is_cap := true;
        return next;
        v_cap := true;
      end loop;
    end if;
  end loop;
  if v_cap or p_chain is not null then return; end if;
  for c in 0..63 loop
    if public.dama_owner(b[c + 1]) = p_player then
      for rec in select * from public.dama_steps(b, c) loop
        from_cell := c; to_cell := rec.to_cell; over_cell := null; is_cap := false;
        return next;
      end loop;
    end if;
  end loop;
end $$;
revoke all on function public.dama_legal_moves(int[], int, int) from public, anon, authenticated;

-- ---------------------------------------------------------- create / join / cancel
create or replace function public.dama_create(p_stake numeric)
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
  if exists (select 1 from public.dama_games where creator_id = v_uid and status = 'open' and expires_at > now()) then
    raise exception 'you already have an open game';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  v_code := public.dama_code();
  insert into public.dama_games (code, creator_id, stake_units) values (v_code, v_uid, p_stake) returning id into v_id;
  insert into public.wallet_ledger (user_id, amount_units, kind, dama_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Dama game ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.dama_create(numeric) from public, anon;
grant execute on function public.dama_create(numeric) to authenticated;

create or replace function public.dama_join(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.dama_games; v_name text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  select * into r from public.dama_games where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'game not found'; end if;
  if r.creator_id = v_uid then raise exception 'you already joined this game'; end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'this game is closed'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  insert into public.wallet_ledger (user_id, amount_units, kind, dama_id, reference, created_by)
  values (v_uid, -r.stake_units, 'entry_fee', r.id, 'Dama game ' || r.code || ' stake', v_uid);
  update public.dama_games
     set opponent_id = v_uid, status = 'live', started_at = now(), turn = 1 + floor(random() * 2)::int, turn_deadline = now() + interval '60 seconds'
   where id = r.id;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.creator_id, 'dama_join', '♟️ ' || v_name || ' joined your Dama game', 'The game has started: open it now, moves take 60 seconds.', '/dama/' || r.code);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.dama_join(text) from public, anon;
grant execute on function public.dama_join(text) to authenticated;

create or replace function public.dama_cancel(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.dama_games;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.dama_games where code = upper(btrim(p_code)) for update;
  if r.id is null or r.creator_id is distinct from v_uid then raise exception 'game not found'; end if;
  if r.status <> 'open' then raise exception 'this game is closed'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, dama_id, reference)
  values (r.creator_id, r.stake_units, 'refund', r.id, 'Dama game ' || r.code || ' cancelled');
  update public.dama_games set status = 'cancelled', settled_at = now() where id = r.id;
end $$;
revoke all on function public.dama_cancel(text) from public, anon;
grant execute on function public.dama_cancel(text) to authenticated;

-- ---------------------------------------------------------- finish / advance (internal)
create or replace function public.dama_finish(p_game bigint, p_winner uuid, p_result text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.dama_games; v_each numeric; v_loser uuid;
begin
  select * into r from public.dama_games where id = p_game for update;
  if r.id is null or r.status <> 'live' then return; end if;
  if p_winner is null then
    insert into public.wallet_ledger (user_id, amount_units, kind, dama_id, reference)
    select u, r.stake_units, 'refund', r.id, 'Dama game ' || r.code || ' draw: stakes returned' from unnest(array[r.creator_id, r.opponent_id]) u;
    update public.dama_games set status = 'settled', result = 'draw', settled_at = now(), turn_deadline = null where id = r.id;
    insert into public.notifications (user_id, kind, title, body, link)
    select u, 'dama_result', '🤝 Dama: a draw', 'Nobody could break through: both stakes are back in your wallets.', '/dama/' || r.code from unnest(array[r.creator_id, r.opponent_id]) u;
    return;
  end if;
  v_loser := case when p_winner = r.creator_id then r.opponent_id else r.creator_id end;
  v_each := public.fair_prize_each(r.stake_units, 2, 1, r.fee_pct);
  insert into public.wallet_ledger (user_id, amount_units, kind, dama_id, reference)
  values (p_winner, v_each, 'payout', r.id, 'Dama game ' || r.code || ' winnings');
  update public.dama_games set status = 'settled', winner_id = p_winner, result = p_result, settled_at = now(), turn_deadline = null where id = r.id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (v_loser, 'dama_result', '♟️ Dama: you lost',
          case p_result when 'timeout' then 'You ran out of time on a move.' when 'resign' then 'You resigned.' else 'Your opponent won the game.' end || ' Rematch?', '/dama/' || r.code);
end $$;
revoke all on function public.dama_finish(bigint, uuid, text) from public, anon, authenticated;

create or replace function public.dama_advance(p_game bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.dama_games;
begin
  select * into r from public.dama_games where id = p_game for update;
  if r.id is null then return; end if;
  if r.status = 'open' and r.expires_at <= now() then
    insert into public.wallet_ledger (user_id, amount_units, kind, dama_id, reference)
    values (r.creator_id, r.stake_units, 'refund', r.id, 'Dama game ' || r.code || ' nobody joined');
    update public.dama_games set status = 'cancelled', settled_at = now() where id = r.id;
  elsif r.status = 'live' and r.turn_deadline is not null and r.turn_deadline < now() then
    perform public.dama_finish(r.id, case when r.turn = 1 then r.opponent_id else r.creator_id end, 'timeout');
  end if;
end $$;
revoke all on function public.dama_advance(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------- one step of a move (a jump, or a plain step)
create or replace function public.dama_move(p_code text, p_from int, p_to int)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  r      public.dama_games;
  v_seat int;
  m      record;
  b      int[];
  v      int;
  v_non  int;
  v_more boolean;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.dama_games where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'game not found'; end if;
  if r.status <> 'live' then raise exception 'this game is not running'; end if;
  v_seat := case when v_uid = r.creator_id then 1 when v_uid = r.opponent_id then 2 else 0 end;
  if v_seat = 0 then raise exception 'you are not in this game'; end if;
  if r.turn_deadline < now() then
    perform public.dama_advance(r.id);
    return;
  end if;
  if r.turn <> v_seat then raise exception 'not your turn'; end if;
  if p_from is null or p_to is null or p_from not between 0 and 63 or p_to not between 0 and 63 then raise exception 'illegal move'; end if;

  select * into m from public.dama_legal_moves(r.board, v_seat, r.chain_from) lm where lm.from_cell = p_from and lm.to_cell = p_to limit 1;
  if m.from_cell is null then raise exception 'illegal move'; end if;

  b := r.board;
  v := b[p_from + 1];
  b[p_from + 1] := 0;
  b[p_to + 1] := v;
  if m.is_cap then b[m.over_cell + 1] := 0; end if;

  -- a capture that can go on must go on, with the same piece
  if m.is_cap then
    select exists (select 1 from public.dama_caps(b, p_to)) into v_more;
    if v_more then
      update public.dama_games set board = b, chain_from = p_to, non_capture = 0, last_from = p_from, last_to = p_to, moves = moves + 1, turn_deadline = now() + interval '60 seconds' where id = r.id;
      return;
    end if;
  end if;

  -- the move is over: a man on the far row becomes a king
  if v = 1 and p_to / 8 = 7 then b[p_to + 1] := 2; end if;
  if v = 3 and p_to / 8 = 0 then b[p_to + 1] := 4; end if;
  v_non := case when m.is_cap then 0 else r.non_capture + 1 end;

  if not exists (select 1 from public.dama_legal_moves(b, 3 - v_seat, null)) then
    update public.dama_games set board = b, chain_from = null, non_capture = v_non, last_from = p_from, last_to = p_to, moves = moves + 1 where id = r.id;
    perform public.dama_finish(r.id, v_uid, 'score');
    return;
  end if;
  if v_non >= 60 then
    update public.dama_games set board = b, chain_from = null, non_capture = v_non, last_from = p_from, last_to = p_to, moves = moves + 1 where id = r.id;
    perform public.dama_finish(r.id, null, 'draw');
    return;
  end if;
  update public.dama_games
     set board = b, chain_from = null, non_capture = v_non, last_from = p_from, last_to = p_to, moves = moves + 1,
         turn = 3 - r.turn, turn_deadline = now() + interval '60 seconds'
   where id = r.id;
end $$;
revoke all on function public.dama_move(text, int, int) from public, anon;
grant execute on function public.dama_move(text, int, int) to authenticated;

create or replace function public.dama_resign(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.dama_games;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.dama_games where code = upper(btrim(p_code)) for update;
  if r.id is null or v_uid not in (r.creator_id, coalesce(r.opponent_id, r.creator_id)) then raise exception 'game not found'; end if;
  if r.status <> 'live' then raise exception 'this game is not running'; end if;
  perform public.dama_finish(r.id, case when v_uid = r.creator_id then r.opponent_id else r.creator_id end, 'resign');
end $$;
revoke all on function public.dama_resign(text) from public, anon;
grant execute on function public.dama_resign(text) to authenticated;

create or replace function public.settle_due_dama()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in select id from public.dama_games
            where (status = 'open' and expires_at <= now()) or (status = 'live' and turn_deadline < now()) loop
    perform public.dama_advance(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.settle_due_dama() from public, anon, authenticated;
grant execute on function public.settle_due_dama() to service_role;

-- ---------------------------------------------------------- what the page sees
create or replace function public.dama_state(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.dama_games;
  v_c   text; v_o text; v_w text;
  v_seat int;
  v_legal jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.dama_games where code = upper(btrim(p_code));
  if r.id is null then return null; end if;
  perform public.dama_advance(r.id);
  select * into r from public.dama_games where id = r.id;
  select username into v_c from public.profiles where id = r.creator_id;
  select username into v_o from public.profiles where id = r.opponent_id;
  select username into v_w from public.profiles where id = r.winner_id;
  v_seat := case when v_uid = r.creator_id then 1 when v_uid = r.opponent_id then 2 else 0 end;
  if r.status = 'live' and v_seat <> 0 and r.turn = v_seat then
    select coalesce(jsonb_agg(jsonb_build_array(lm.from_cell, lm.to_cell)), '[]'::jsonb) into v_legal from public.dama_legal_moves(r.board, v_seat, r.chain_from) lm;
  end if;
  return jsonb_build_object(
    'code', r.code, 'status', r.status, 'stake_units', r.stake_units, 'fee_pct', r.fee_pct,
    'creator', v_c, 'opponent', v_o, 'my_seat', v_seat, 'turn', r.turn,
    'board', to_jsonb(r.board), 'chain_from', r.chain_from, 'last_from', r.last_from, 'last_to', r.last_to, 'moves', r.moves,
    'legal', v_legal,
    'ms_left', case when r.status = 'live' then greatest(0, floor(extract(epoch from (r.turn_deadline - clock_timestamp())) * 1000))::bigint end,
    'expires_in_s', greatest(0, floor(extract(epoch from (r.expires_at - now()))))::int,
    'winner', v_w, 'result', r.result, 'i_won', r.winner_id = v_uid);
end $$;
revoke all on function public.dama_state(text) from public, anon;
grant execute on function public.dama_state(text) to authenticated;

create or replace function public.dama_my_games()
returns table (code text, status text, stake_units numeric, creator text, opponent text, i_won boolean, result text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.code, g.status, g.stake_units, c.username, o.username, g.winner_id = auth.uid(), g.result, g.created_at
    from public.dama_games g
    join public.profiles c on c.id = g.creator_id
    left join public.profiles o on o.id = g.opponent_id
   where auth.uid() in (g.creator_id, g.opponent_id) and g.created_at > now() - interval '30 days'
   order by g.created_at desc
   limit 30;
$$;
revoke all on function public.dama_my_games() from public, anon;
grant execute on function public.dama_my_games() to authenticated;

-- ---------------------------------------------------------- wallet notifications know about Dama games
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
  if new.dama_id is not null then
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
    if new.challenge_id is null and new.royale_id is null and new.survivor_id is null and new.gebeta_id is null and new.dama_id is null then
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
