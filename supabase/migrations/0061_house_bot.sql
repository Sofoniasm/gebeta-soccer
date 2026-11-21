-- =====================================================================
-- 0061: the House Bot for Chess (a clearly labelled computer player) + open games anyone can join.
--   * A game can be "open to anyone": it is listed for other players. If nobody joins within 2 minutes the
--     House Bot (Stockfish, run by the server) may join. It is always shown as a computer, never as a person.
--   * The bot plays with its own wallet (the house bank): it pays the same stake, and if it loses, the player is
--     paid from that wallet. If the bot's wallet is too low it simply cannot join.
--   * Safety brakes (all editable by the admin in Admin -> Chess bot):
--       - the bot is switched off by default until the admin funds it and enables it,
--       - maximum stake against the bot: 1 Unit (200 ETB),
--       - each player can play the bot at most 3 games a day,
--       - the bot's net loss in one day (Addis Ababa time) may not pass 50 Units (10,000 ETB),
--       - after 2 losses in a row the bot PAUSES itself and stays paused until the admin resumes it.
--   * Humans first: the bot never joins before the 2 minutes are over, and only joins games that are open to anyone.
-- Money still moves only as wallet_ledger rows; the bot's stake and winnings are ordinary ledger rows.
-- =====================================================================

-- ---------------------------------------------------------- the bot's account (cannot log in: no password, no phone)
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-00000000b075', null, '{"username": "House Bot", "date_of_birth": "1990-01-01"}')
on conflict (id) do nothing;
update public.profiles set username = 'House Bot', date_of_birth = coalesce(date_of_birth, date '1990-01-01') where id = '00000000-0000-4000-8000-00000000b075';

create table if not exists public.house_bot_settings (
  id                     int primary key default 1 check (id = 1),
  bot_id                 uuid not null default '00000000-0000-4000-8000-00000000b075' references public.profiles (id),
  enabled                boolean not null default false,
  max_stake_units        numeric(12,2) not null default 1 check (max_stake_units >= 1 and max_stake_units <= 50),
  daily_loss_limit_units numeric(12,2) not null default 50 check (daily_loss_limit_units >= 1),
  max_consecutive_losses int not null default 2 check (max_consecutive_losses between 1 and 10),
  per_player_daily_games int not null default 3 check (per_player_daily_games between 1 and 50),
  join_after_seconds     int not null default 120 check (join_after_seconds between 30 and 3600),
  paused_at              timestamptz,
  paused_reason          text,
  updated_at             timestamptz not null default now()
);
insert into public.house_bot_settings (id) values (1) on conflict (id) do nothing;
alter table public.house_bot_settings enable row level security;
revoke all on public.house_bot_settings from anon, authenticated;

alter table public.chess_games add column if not exists open_to_all boolean not null default false;
alter table public.chess_games add column if not exists vs_bot boolean not null default false;
alter table public.chess_games add column if not exists bot_claim_until timestamptz;

-- ---------------------------------------------------------- create: now with "open to anyone"
drop function if exists public.chess_create(numeric);
create or replace function public.chess_create(p_stake numeric, p_open boolean default false)
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
  insert into public.chess_games (code, creator_id, stake_units, open_to_all) values (v_code, v_uid, p_stake, coalesce(p_open, false)) returning id into v_id;
  insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Chess game ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.chess_create(numeric, boolean) from public, anon;
grant execute on function public.chess_create(numeric, boolean) to authenticated;

-- games waiting for an opponent that anyone may join
create or replace function public.chess_open_games()
returns table (code text, creator text, stake_units numeric, age_s int)
language sql stable security definer set search_path = public as $$
  select g.code, c.username, g.stake_units, floor(extract(epoch from (now() - g.created_at)))::int
    from public.chess_games g
    join public.profiles c on c.id = g.creator_id
   where g.status = 'open' and g.open_to_all and g.expires_at > now() and g.creator_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
   order by g.created_at
   limit 20;
$$;
revoke all on function public.chess_open_games() from public, anon;
grant execute on function public.chess_open_games() to authenticated;

-- ---------------------------------------------------------- may the bot join this game? (null = yes, otherwise why not)
create or replace function public.house_bot_check(p_game bigint, p_ignore_wait boolean default false)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  s        public.house_bot_settings;
  g        public.chess_games;
  v_today  timestamptz := date_trunc('day', now() at time zone 'Africa/Addis_Ababa') at time zone 'Africa/Addis_Ababa';
  v_loss   numeric;
begin
  select * into s from public.house_bot_settings where id = 1;
  select * into g from public.chess_games where id = p_game;
  if g.id is null or g.status <> 'open' or not g.open_to_all or g.expires_at <= now() then return 'this game is not open to the bot'; end if;
  if not s.enabled then return 'the House Bot is switched off'; end if;
  if s.paused_at is not null then return 'the House Bot is paused'; end if;
  if g.stake_units > s.max_stake_units then return 'the stake is above the House Bot limit'; end if;
  if (select count(*) from public.chess_games x where x.vs_bot and x.creator_id = g.creator_id and x.created_at >= v_today) >= s.per_player_daily_games then
    return 'you already played the House Bot the most times allowed today';
  end if;
  select coalesce(-sum(amount_units), 0) into v_loss from public.wallet_ledger where user_id = s.bot_id and chess_id is not null and created_at >= v_today;
  if v_loss + g.stake_units > s.daily_loss_limit_units then return 'the House Bot reached its daily limit'; end if;
  if (select balance_units from public.profiles where id = s.bot_id) < g.stake_units then return 'the House Bot wallet is too low'; end if;
  if not p_ignore_wait and g.created_at + make_interval(secs => s.join_after_seconds) > now() then return 'waiting'; end if;
  return null;
end $$;
revoke all on function public.house_bot_check(bigint, boolean) from public, anon, authenticated;

-- the server asks the bot to join (only service_role)
create or replace function public.chess_bot_join(p_code text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare g public.chess_games; s public.house_bot_settings;
begin
  select * into g from public.chess_games where code = upper(btrim(p_code)) for update;
  if g.id is null then return false; end if;
  if public.house_bot_check(g.id, false) is not null then return false; end if;
  select * into s from public.house_bot_settings where id = 1;
  insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference, created_by)
  values (s.bot_id, -g.stake_units, 'entry_fee', g.id, 'Chess game ' || g.code || ' stake (House Bot)', s.bot_id);
  update public.chess_games
     set opponent_id = s.bot_id, vs_bot = true, status = 'live', started_at = now(),
         white_id = case when random() < 0.5 then g.creator_id else s.bot_id end,
         turn_deadline = now() + interval '120 seconds'
   where id = g.id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (g.creator_id, 'chess_join', '🤖 The House Bot joined your Chess game', 'Nobody else joined, so the House Bot (a computer) is your opponent. Open the game now.', '/chess/' || g.code);
  return true;
exception
  when check_violation then return false;
end $$;
revoke all on function public.chess_bot_join(text) from public, anon, authenticated;
grant execute on function public.chess_bot_join(text) to service_role;

-- a lock so that only one request at a time computes the bot's move
create or replace function public.chess_bot_claim(p_code text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare g public.chess_games; s public.house_bot_settings; v_white_to_move boolean; v_bot_to_move boolean;
begin
  select * into g from public.chess_games where code = upper(btrim(p_code)) for update;
  select * into s from public.house_bot_settings where id = 1;
  if g.id is null or g.status <> 'live' or not g.vs_bot then return false; end if;
  v_white_to_move := split_part(g.fen, ' ', 2) = 'w';
  v_bot_to_move := (v_white_to_move and g.white_id = s.bot_id) or (not v_white_to_move and g.white_id <> s.bot_id);
  if not v_bot_to_move then return false; end if;
  if g.bot_claim_until is not null and g.bot_claim_until > now() then return false; end if;
  update public.chess_games set bot_claim_until = now() + interval '12 seconds' where id = g.id;
  return true;
end $$;
revoke all on function public.chess_bot_claim(text) from public, anon, authenticated;
grant execute on function public.chess_bot_claim(text) to service_role;

-- after every bot game: too many losses in a row pauses the bot until the admin resumes it
create or replace function public.house_bot_after_game(p_game bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare s public.house_bot_settings; v_streak boolean;
begin
  select * into s from public.house_bot_settings where id = 1;
  select count(*) = s.max_consecutive_losses and bool_and(winner_id is not null and winner_id <> s.bot_id) into v_streak
    from (select winner_id from public.chess_games where vs_bot and status = 'settled' order by settled_at desc, id desc limit s.max_consecutive_losses) l;
  if coalesce(v_streak, false) and s.paused_at is null then
    update public.house_bot_settings set paused_at = now(), paused_reason = 'Lost ' || s.max_consecutive_losses || ' games in a row', updated_at = now() where id = 1;
    insert into public.notifications (user_id, kind, title, body, link)
    select id, 'house_bot_paused', '🤖 House Bot paused', 'It lost ' || s.max_consecutive_losses || ' games in a row and stopped accepting games. Resume it in Admin -> Chess bot when you are ready.', '/admin/chessbot'
      from public.profiles where is_admin;
  end if;
end $$;
revoke all on function public.house_bot_after_game(bigint) from public, anon, authenticated;

-- chess_finish: same as before, plus the bot's safety check
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
  else
    v_loser := case when p_winner = r.creator_id then r.opponent_id else r.creator_id end;
    v_each := public.fair_prize_each(r.stake_units, 2, 1, r.fee_pct);
    insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference)
    values (p_winner, v_each, 'payout', r.id, 'Chess game ' || r.code || ' winnings');
    update public.chess_games set status = 'settled', winner_id = p_winner, result = p_result, settled_at = now(), turn_deadline = null where id = r.id;
    insert into public.notifications (user_id, kind, title, body, link)
    values (v_loser, 'chess_result', '♞ Chess: you lost',
            case p_result when 'timeout' then 'You ran out of time on a move.' when 'resign' then 'You resigned.' else 'Checkmate.' end || ' Rematch?', '/chess/' || r.code);
  end if;
  if r.vs_bot then perform public.house_bot_after_game(r.id); end if;
end $$;
revoke all on function public.chess_finish(bigint, uuid, text) from public, anon, authenticated;

-- chess_advance: if the BOT's clock runs out (the server failed to move for it), the game is a draw and both stakes
-- are returned: a player must never win because of a server hiccup.
create or replace function public.chess_advance(p_game bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.chess_games; v_white_to_move boolean; v_mover uuid; v_bot uuid;
begin
  select * into r from public.chess_games where id = p_game for update;
  if r.id is null then return; end if;
  if r.status = 'open' and r.expires_at <= now() then
    insert into public.wallet_ledger (user_id, amount_units, kind, chess_id, reference)
    values (r.creator_id, r.stake_units, 'refund', r.id, 'Chess game ' || r.code || ' nobody joined');
    update public.chess_games set status = 'cancelled', settled_at = now() where id = r.id;
  elsif r.status = 'live' and r.turn_deadline is not null and r.turn_deadline < now() then
    v_white_to_move := split_part(r.fen, ' ', 2) = 'w';
    v_mover := case when v_white_to_move then r.white_id else (case when r.white_id = r.creator_id then r.opponent_id else r.creator_id end) end;
    select bot_id into v_bot from public.house_bot_settings where id = 1;
    if r.vs_bot and v_mover = v_bot then
      perform public.chess_finish(r.id, null, 'draw');
    else
      perform public.chess_finish(r.id, case when v_mover = r.opponent_id then r.creator_id else r.opponent_id end, 'timeout');
    end if;
  end if;
end $$;
revoke all on function public.chess_advance(bigint) from public, anon, authenticated;

-- chess_state: same as before, plus what the screen and the server need to know about the bot
create or replace function public.chess_state(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.chess_games;
  s     public.house_bot_settings;
  v_c   text; v_o text; v_w text;
  v_seat int;
  v_color text;
  v_white_to_move boolean;
  v_bot_to_move boolean := false;
  v_wait int := null;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.chess_games where code = upper(btrim(p_code));
  if r.id is null then return null; end if;
  perform public.chess_advance(r.id);
  select * into r from public.chess_games where id = r.id;
  select * into s from public.house_bot_settings where id = 1;
  select username into v_c from public.profiles where id = r.creator_id;
  select username into v_o from public.profiles where id = r.opponent_id;
  select username into v_w from public.profiles where id = r.winner_id;
  v_seat := case when v_uid = r.creator_id then 1 when v_uid = r.opponent_id then 2 else 0 end;
  v_color := case when v_seat = 0 or r.white_id is null then null when r.white_id = v_uid then 'w' else 'b' end;
  if r.status = 'live' and r.vs_bot then
    v_white_to_move := split_part(r.fen, ' ', 2) = 'w';
    v_bot_to_move := (v_white_to_move and r.white_id = s.bot_id) or (not v_white_to_move and r.white_id <> s.bot_id);
  end if;
  if r.status = 'open' and r.open_to_all and public.house_bot_check(r.id, true) is null then
    v_wait := greatest(0, ceil(extract(epoch from (r.created_at + make_interval(secs => s.join_after_seconds) - now()))))::int;
  end if;
  return jsonb_build_object(
    'code', r.code, 'status', r.status, 'stake_units', r.stake_units, 'fee_pct', r.fee_pct,
    'creator', v_c, 'opponent', v_o, 'my_seat', v_seat, 'my_color', v_color,
    'white', case when r.white_id is null then null when r.white_id = r.creator_id then v_c else v_o end,
    'fen', r.fen, 'turn', split_part(r.fen, ' ', 2), 'san_moves', to_jsonb(r.san_moves), 'last_from', r.last_from, 'last_to', r.last_to,
    'ms_left', case when r.status = 'live' then greatest(0, floor(extract(epoch from (r.turn_deadline - clock_timestamp())) * 1000))::bigint end,
    'expires_in_s', greatest(0, floor(extract(epoch from (r.expires_at - now()))))::int,
    'winner', v_w, 'result', r.result, 'i_won', r.winner_id = v_uid,
    'open_to_all', r.open_to_all, 'vs_bot', r.vs_bot, 'bot_to_move', v_bot_to_move,
    'bot_wait_s', v_wait, 'bot_max_stake_units', s.max_stake_units);
end $$;
revoke all on function public.chess_state(text) from public, anon;
grant execute on function public.chess_state(text) to authenticated;

notify pgrst, 'reload schema';
