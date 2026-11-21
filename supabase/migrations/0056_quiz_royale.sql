-- =====================================================================
-- 0056: Quiz Royale — 3 to 6 players, 10 questions, 15 seconds each.
--   Everyone pays the same stake into the room. Right answers score 100 points, plus up to 100 more for
--   speed. The highest score wins their stake back + 90% of the others' stakes (same fair-fee maths as
--   challenges); exact ties share; nobody scoring = every stake back. Nothing started in 30 minutes = refund.
--   The SERVER decides everything: questions open on a fixed clock from the start time, the right answer
--   is never sent to a browser before its question has closed, and answers are timed by the database.
-- Money moves only as wallet_ledger rows (entry_fee / payout / refund), like challenges.
-- =====================================================================

-- ---------------------------------------------------------- tables (server only)
create table if not exists public.royale_questions (
  id         bigint generated always as identity primary key,
  question   text not null check (char_length(question) between 5 and 300),
  options    text[] not null check (array_length(options, 1) = 4),
  correct    smallint not null check (correct between 0 and 3),
  topic      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.royale_rooms (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  creator_id   uuid not null references public.profiles (id) on delete restrict,
  stake_units  numeric(12,2) not null check (stake_units >= 1 and stake_units <= 50),
  min_players  int not null default 3 check (min_players between 2 and 6),
  max_players  int not null default 6 check (max_players between 2 and 6),
  fee_pct      numeric(4,3) not null default 0.100 check (fee_pct >= 0 and fee_pct < 1),
  status       text not null default 'open' check (status in ('open', 'live', 'settled', 'refunded', 'cancelled')),
  question_ids bigint[],
  started_at   timestamptz,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 minutes'),
  settled_at   timestamptz
);
create index if not exists royale_rooms_status_idx on public.royale_rooms (status, expires_at);

create table if not exists public.royale_players (
  room_id      bigint not null references public.royale_rooms (id) on delete cascade,
  user_id      uuid   not null references public.profiles (id) on delete restrict,
  joined_at    timestamptz not null default now(),
  score        int not null default 0,
  correct      int not null default 0,
  total_ms     bigint not null default 0,   -- time of the right answers (tie-break: faster wins)
  rank         int,
  payout_units numeric(12,2),
  primary key (room_id, user_id)
);
create index if not exists royale_players_user_idx on public.royale_players (user_id);

create table if not exists public.royale_answers (
  room_id    bigint not null references public.royale_rooms (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete restrict,
  q_index    smallint not null check (q_index between 0 and 9),
  choice     smallint not null check (choice between 0 and 3),
  correct    boolean not null,
  points     int not null,
  elapsed_ms int not null,
  answered_at timestamptz not null default now(),
  primary key (room_id, user_id, q_index)
);

alter table public.royale_questions enable row level security;
alter table public.royale_rooms     enable row level security;
alter table public.royale_players   enable row level security;
alter table public.royale_answers   enable row level security;
revoke all on public.royale_questions, public.royale_rooms, public.royale_players, public.royale_answers from anon, authenticated;

alter table public.wallet_ledger add column if not exists royale_id bigint references public.royale_rooms (id);

-- ---------------------------------------------------------- starter questions (checked facts)
insert into public.royale_questions (question, options, correct, topic)
select q, o, c, t from (values
  ('Which country hosted the 2022 FIFA World Cup?', array['Qatar', 'Russia', 'Brazil', 'Germany'], 0, 'football'),
  ('Which country won the 2022 FIFA World Cup?', array['France', 'Argentina', 'Croatia', 'Brazil'], 1, 'football'),
  ('How many players of one team are on the pitch at the same time?', array['9', '10', '11', '12'], 2, 'football'),
  ('How many minutes does a normal football match last (without extra time)?', array['80', '90', '100', '120'], 1, 'football'),
  ('Which club is nicknamed "the Red Devils"?', array['Liverpool', 'Arsenal', 'Manchester United', 'Bayern Munich'], 2, 'football'),
  ('Which club plays its home games at Anfield?', array['Chelsea', 'Liverpool', 'Everton', 'Tottenham'], 1, 'football'),
  ('Which club plays at the Santiago Bernabéu stadium?', array['Barcelona', 'Atlético Madrid', 'Real Madrid', 'Sevilla'], 2, 'football'),
  ('Which club did Lionel Messi leave in 2021 to join Paris Saint-Germain?', array['Real Madrid', 'Barcelona', 'Inter Miami', 'Juventus'], 1, 'football'),
  ('Which country won the first FIFA World Cup in 1930?', array['Brazil', 'Italy', 'Uruguay', 'Argentina'], 2, 'football'),
  ('Which national team won the Africa Cup of Nations played in early 2022?', array['Egypt', 'Senegal', 'Cameroon', 'Algeria'], 1, 'football'),
  ('What is the name of the main African national teams tournament?', array['Africa Cup of Nations', 'CAF Super Cup', 'Gold Cup', 'COSAFA Cup'], 0, 'football'),
  ('In which city is the Emirates Stadium of Arsenal?', array['Manchester', 'London', 'Liverpool', 'Birmingham'], 1, 'football'),
  ('What is the capital city of Ethiopia?', array['Hawassa', 'Dire Dawa', 'Addis Ababa', 'Bahir Dar'], 2, 'ethiopia'),
  ('Which colours are on the flag of Ethiopia?', array['Green, yellow and red', 'Blue, white and red', 'Black, red and green', 'Green and white'], 0, 'ethiopia'),
  ('Who won the 1960 Olympic marathon in Rome running barefoot?', array['Haile Gebrselassie', 'Abebe Bikila', 'Mamo Wolde', 'Kenenisa Bekele'], 1, 'ethiopia'),
  ('What is the nickname of the Ethiopian national football team?', array['Walias', 'Super Eagles', 'Lions', 'Pharaohs'], 0, 'ethiopia'),
  ('Which is the longest river in Africa?', array['Congo', 'Niger', 'Nile', 'Zambezi'], 2, 'general'),
  ('On which continent is Ethiopia?', array['Asia', 'Europe', 'Africa', 'South America'], 2, 'general'),
  ('Which planet is closest to the Sun?', array['Venus', 'Mercury', 'Mars', 'Earth'], 1, 'general'),
  ('How many continents are there?', array['5', '6', '7', '8'], 2, 'general')
) as v(q, o, c, t)
where not exists (select 1 from public.royale_questions);

-- ---------------------------------------------------------- helpers
create or replace function public.royale_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'QR-' || (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.royale_rooms where code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.royale_code() from public, anon, authenticated;

-- ---------------------------------------------------------- create / join / leave / start
create or replace function public.royale_create(p_stake numeric, p_min_players int default 3)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_id   bigint;
  v_code text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 50 or p_stake * 4 <> floor(p_stake * 4) then
    raise exception 'stake must be 200 to 10,000 ETB in steps of 50 ETB';
  end if;
  if p_min_players is null or p_min_players not between 2 and 6 then raise exception 'min players must be 2 to 6'; end if;
  if (select count(*) from public.royale_questions where active) < 10 then raise exception 'not enough questions yet'; end if;
  -- one open room at a time per player keeps the lobby tidy
  if exists (select 1 from public.royale_rooms where creator_id = v_uid and status = 'open' and expires_at > now()) then
    raise exception 'you already have an open room';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  v_code := public.royale_code();
  insert into public.royale_rooms (code, creator_id, stake_units, min_players) values (v_code, v_uid, p_stake, p_min_players) returning id into v_id;
  insert into public.royale_players (room_id, user_id) values (v_id, v_uid);
  insert into public.wallet_ledger (user_id, amount_units, kind, royale_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Quiz Royale ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.royale_create(numeric, int) from public, anon;
grant execute on function public.royale_create(numeric, int) to authenticated;

create or replace function public.royale_join(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.royale_rooms;
  v_n   int;
  v_name text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  select * into r from public.royale_rooms where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'room not found'; end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'this room is closed'; end if;
  if exists (select 1 from public.royale_players where room_id = r.id and user_id = v_uid) then raise exception 'you already joined this room'; end if;
  select count(*) into v_n from public.royale_players where room_id = r.id;
  if v_n >= r.max_players then raise exception 'this room is full'; end if;

  perform 1 from public.profiles where id = v_uid for update;
  insert into public.royale_players (room_id, user_id) values (r.id, v_uid);
  insert into public.wallet_ledger (user_id, amount_units, kind, royale_id, reference, created_by)
  values (v_uid, -r.stake_units, 'entry_fee', r.id, 'Quiz Royale ' || r.code || ' stake', v_uid);

  select username into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.creator_id, 'royale_join', '👥 ' || v_name || ' joined your Quiz Royale',
          (v_n + 1) || ' of ' || r.max_players || ' players · pot ' || public.fmt_units(r.stake_units * (v_n + 1)) || ' Units.', '/royale/' || r.code);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.royale_join(text) from public, anon;
grant execute on function public.royale_join(text) to authenticated;

-- refund everyone in a room that never started (internal)
create or replace function public.royale_refund_all(p_room bigint, p_reason text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.royale_rooms; rec record;
begin
  select * into r from public.royale_rooms where id = p_room for update;
  if r.id is null or r.status not in ('open', 'live') then return; end if;
  for rec in select user_id from public.royale_players where room_id = r.id loop
    insert into public.wallet_ledger (user_id, amount_units, kind, royale_id, reference)
    values (rec.user_id, r.stake_units, 'refund', r.id, 'Quiz Royale ' || r.code || ' ' || p_reason);
  end loop;
  update public.royale_rooms set status = 'cancelled', settled_at = now() where id = r.id;
end $$;
revoke all on function public.royale_refund_all(bigint, text) from public, anon, authenticated;

-- a player leaves before the start: stake back; the creator leaving cancels the room for everyone
create or replace function public.royale_leave(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.royale_rooms;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.royale_rooms where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'room not found'; end if;
  if r.status <> 'open' then raise exception 'this room is closed'; end if;
  if not exists (select 1 from public.royale_players where room_id = r.id and user_id = v_uid) then raise exception 'you are not in this room'; end if;
  if r.creator_id = v_uid then
    perform public.royale_refund_all(r.id, 'cancelled');
  else
    insert into public.wallet_ledger (user_id, amount_units, kind, royale_id, reference)
    values (v_uid, r.stake_units, 'refund', r.id, 'Quiz Royale ' || r.code || ' left before the start');
    delete from public.royale_players where room_id = r.id and user_id = v_uid;
  end if;
end $$;
revoke all on function public.royale_leave(text) from public, anon;
grant execute on function public.royale_leave(text) to authenticated;

-- the creator starts it: 5 seconds countdown, then question 1 opens
create or replace function public.royale_start(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.royale_rooms; v_n int; v_ids bigint[];
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.royale_rooms where code = upper(btrim(p_code)) for update;
  if r.id is null or r.creator_id is distinct from v_uid then raise exception 'room not found'; end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'this room is closed'; end if;
  select count(*) into v_n from public.royale_players where room_id = r.id;
  if v_n < r.min_players then raise exception 'need at least % players', r.min_players; end if;
  v_ids := array(select id from public.royale_questions where active order by random() limit 10);
  if coalesce(array_length(v_ids, 1), 0) < 10 then raise exception 'not enough questions yet'; end if;
  update public.royale_rooms set status = 'live', question_ids = v_ids, started_at = now() + interval '5 seconds' where id = r.id;
  insert into public.notifications (user_id, kind, title, body, link)
  select p.user_id, 'royale_start', '🧠 Quiz Royale is starting!', 'Open the room now: question 1 starts in a few seconds.', '/royale/' || r.code
    from public.royale_players p where p.room_id = r.id and p.user_id <> v_uid;
end $$;
revoke all on function public.royale_start(text) from public, anon;
grant execute on function public.royale_start(text) to authenticated;

-- ---------------------------------------------------------- answering (timed by the database)
-- Question i opens at started_at + i x 18 s and takes answers for 15 s (+0.5 s for the network).
create or replace function public.royale_answer(p_code text, p_q int, p_choice int)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  r      public.royale_rooms;
  v_el   numeric;
  v_idx  int;
  v_ms   int;
  v_corr smallint;
  v_ok   boolean;
  v_pts  int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.royale_rooms where code = upper(btrim(p_code));
  if r.id is null or r.status <> 'live' then raise exception 'this game is not running'; end if;
  if not exists (select 1 from public.royale_players where room_id = r.id and user_id = v_uid) then raise exception 'you are not in this room'; end if;
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'pick one of the four answers'; end if;
  v_el := extract(epoch from (clock_timestamp() - r.started_at));
  if v_el < 0 then raise exception 'the question is not open yet'; end if;
  v_idx := floor(v_el / 18)::int;
  if v_idx > 9 or p_q is distinct from v_idx then raise exception 'the question is not open'; end if;
  v_ms := round((v_el - v_idx * 18) * 1000)::int;
  if v_ms > 15500 then raise exception 'time is up for this question'; end if;
  v_ms := least(v_ms, 15000);

  select correct into v_corr from public.royale_questions where id = r.question_ids[v_idx + 1];
  v_ok  := (p_choice = v_corr);
  v_pts := case when v_ok then 100 + round(100 * (15000 - v_ms) / 15000.0)::int else 0 end;
  begin
    insert into public.royale_answers (room_id, user_id, q_index, choice, correct, points, elapsed_ms)
    values (r.id, v_uid, v_idx, p_choice, v_ok, v_pts, v_ms);
  exception when unique_violation then
    raise exception 'you already answered this question';
  end;
  update public.royale_players
     set score = score + v_pts,
         correct = correct + (case when v_ok then 1 else 0 end),
         total_ms = total_ms + (case when v_ok then v_ms else 0 end)
   where room_id = r.id and user_id = v_uid;
end $$;
revoke all on function public.royale_answer(text, int, int) from public, anon;
grant execute on function public.royale_answer(text, int, int) to authenticated;

-- ---------------------------------------------------------- settle (internal, lazy + cron)
create or replace function public.royale_settle_if_due(p_room bigint)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  r         public.royale_rooms;
  v_n       int;
  v_top     int;
  v_winners int;
  v_each    numeric;
  rec       record;
begin
  select * into r from public.royale_rooms where id = p_room for update;
  if r.id is null then return 'missing'; end if;
  if r.status = 'open' and r.expires_at <= now() then
    perform public.royale_refund_all(r.id, 'cancelled: it did not start in time');
    return 'cancelled';
  end if;
  if r.status <> 'live' or clock_timestamp() < r.started_at + interval '183 seconds' then return r.status; end if;

  select count(*), max(score) into v_n, v_top from public.royale_players where room_id = r.id;
  with ranked as (
    select user_id, rank() over (order by score desc, correct desc, total_ms asc) rk from public.royale_players where room_id = r.id
  )
  update public.royale_players rp set rank = ranked.rk from ranked where rp.room_id = r.id and rp.user_id = ranked.user_id;

  if coalesce(v_top, 0) = 0 then
    -- nobody scored: every stake back
    for rec in select user_id from public.royale_players where room_id = r.id loop
      insert into public.wallet_ledger (user_id, amount_units, kind, royale_id, reference)
      values (rec.user_id, r.stake_units, 'refund', r.id, 'Quiz Royale ' || r.code || ' nobody scored, stake refunded');
    end loop;
    update public.royale_rooms set status = 'refunded', settled_at = now() where id = r.id;
    return 'refunded';
  end if;

  select count(*) into v_winners from public.royale_players where room_id = r.id and rank = 1;
  v_each := public.fair_prize_each(r.stake_units, v_n, v_winners, r.fee_pct);
  for rec in select user_id from public.royale_players where room_id = r.id and rank = 1 loop
    insert into public.wallet_ledger (user_id, amount_units, kind, royale_id, reference)
    values (rec.user_id, v_each, 'payout', r.id, 'Quiz Royale ' || r.code || ' winnings');
    update public.royale_players set payout_units = v_each where room_id = r.id and user_id = rec.user_id;
  end loop;

  insert into public.notifications (user_id, kind, title, body, link)
  select pl.user_id, 'royale_result', '📊 Quiz Royale finished',
         'You finished #' || pl.rank || ' of ' || v_n || ' with ' || pl.score || ' points. Better luck next time!', '/royale/' || r.code
    from public.royale_players pl where pl.room_id = r.id and pl.rank > 1;
  update public.royale_rooms set status = 'settled', settled_at = now() where id = r.id;
  return 'settled';
end $$;
revoke all on function public.royale_settle_if_due(bigint) from public, anon, authenticated;

-- for the 2-hourly sync / any server job
create or replace function public.settle_due_royale()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare r record; v_n int := 0; v_s text;
begin
  for r in select id from public.royale_rooms where status in ('open', 'live') order by id loop
    v_s := public.royale_settle_if_due(r.id);
    if v_s in ('settled', 'refunded', 'cancelled') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.settle_due_royale() from public, anon, authenticated;
grant execute on function public.settle_due_royale() to service_role;

-- ---------------------------------------------------------- what the page sees
-- The right answer of a question is included only once its 15 seconds are over. Questions that have not
-- opened yet are never sent. Everyone signed in who has the code can see the lobby; only players see the game.
create or replace function public.royale_state(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  r       public.royale_rooms;
  v_el    numeric;
  v_idx   int;
  v_in    numeric;
  v_phase text := 'lobby';
  v_ms    int := 0;
  v_member boolean;
  v_q     public.royale_questions;
  v_mine  int;
  v_players jsonb;
  v_question jsonb := null;
  v_reveal jsonb := null;
  v_review jsonb := null;
  v_creator text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.royale_rooms where code = upper(btrim(p_code));
  if r.id is null then return null; end if;
  perform public.royale_settle_if_due(r.id);
  select * into r from public.royale_rooms where id = r.id;
  v_member := exists (select 1 from public.royale_players where room_id = r.id and user_id = v_uid);
  select username into v_creator from public.profiles where id = r.creator_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'username', pr.username, 'score', p.score, 'correct', p.correct, 'rank', p.rank,
           'payout', p.payout_units, 'is_me', p.user_id = v_uid, 'is_creator', p.user_id = r.creator_id)
         order by p.score desc, p.correct desc, p.joined_at), '[]'::jsonb)
    into v_players
    from public.royale_players p join public.profiles pr on pr.id = p.user_id where p.room_id = r.id;

  if r.status = 'live' and v_member then
    v_el := extract(epoch from (clock_timestamp() - r.started_at));
    if v_el < 0 then
      v_phase := 'countdown'; v_ms := round(-v_el * 1000)::int;
    else
      v_idx := floor(v_el / 18)::int;
      if v_idx > 9 then
        v_phase := 'finishing'; v_ms := 0;
      else
        v_in := v_el - v_idx * 18;
        select * into v_q from public.royale_questions where id = r.question_ids[v_idx + 1];
        select choice into v_mine from public.royale_answers where room_id = r.id and user_id = v_uid and q_index = v_idx;
        if v_in < 15 then
          v_phase := 'question'; v_ms := round((15 - v_in) * 1000)::int;
          v_question := jsonb_build_object('index', v_idx, 'text', v_q.question, 'options', to_jsonb(v_q.options), 'my_choice', v_mine);
        else
          v_phase := 'reveal'; v_ms := round((18 - v_in) * 1000)::int;
          v_question := jsonb_build_object('index', v_idx, 'text', v_q.question, 'options', to_jsonb(v_q.options), 'my_choice', v_mine);
          v_reveal := jsonb_build_object('index', v_idx, 'correct', v_q.correct);
        end if;
      end if;
    end if;
  elsif r.status in ('settled', 'refunded') then
    v_phase := 'finished';
    if v_member then
      select jsonb_agg(jsonb_build_object('index', i - 1, 'text', q.question, 'options', to_jsonb(q.options), 'correct', q.correct,
                         'my_choice', a.choice, 'points', a.points) order by i)
        into v_review
        from unnest(r.question_ids) with ordinality as t(qid, i)
        join public.royale_questions q on q.id = t.qid
        left join public.royale_answers a on a.room_id = r.id and a.user_id = v_uid and a.q_index = t.i - 1;
    end if;
  elsif r.status = 'cancelled' then
    v_phase := 'cancelled';
  end if;

  return jsonb_build_object(
    'code', r.code, 'status', r.status, 'phase', v_phase, 'ms_left', v_ms,
    'stake_units', r.stake_units, 'min_players', r.min_players, 'max_players', r.max_players, 'fee_pct', r.fee_pct,
    'creator', v_creator, 'is_creator', r.creator_id = v_uid, 'is_member', v_member,
    'expires_in_s', greatest(0, floor(extract(epoch from (r.expires_at - now()))))::int,
    'players', v_players, 'question', v_question, 'reveal', v_reveal, 'review', v_review);
end $$;
revoke all on function public.royale_state(text) from public, anon;
grant execute on function public.royale_state(text) to authenticated;

-- the lobby list: my rooms that are open, live, or finished in the last 3 days
create or replace function public.royale_my_rooms()
returns table (code text, status text, stake_units numeric, players bigint, max_players int, creator text, created_at timestamptz, my_rank int, my_payout numeric)
language sql stable security definer set search_path = public as $$
  select r.code, r.status, r.stake_units,
         (select count(*) from public.royale_players x where x.room_id = r.id),
         r.max_players, pr.username, r.created_at, p.rank, p.payout_units
    from public.royale_players p
    join public.royale_rooms r on r.id = p.room_id
    join public.profiles pr on pr.id = r.creator_id
   where p.user_id = auth.uid() and r.created_at > now() - interval '3 days'
   order by r.created_at desc
   limit 30;
$$;
revoke all on function public.royale_my_rooms() from public, anon;
grant execute on function public.royale_my_rooms() to authenticated;

-- ---------------------------------------------------------- wallet notifications know about Quiz Royale
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
  if new.royale_id is not null then
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
    if new.challenge_id is null and new.royale_id is null then
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

-- make the new functions visible to the API right away
notify pgrst, 'reload schema';
