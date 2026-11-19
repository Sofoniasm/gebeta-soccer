-- 0053: invite players to a challenge by phone number.
--
-- The creator types phone numbers when making a challenge (or later, while it is
-- open). For each number:
--   * a player with that phone gets a notification (in the app + Telegram) right away;
--   * a number with no account yet is remembered, and the invite is delivered the
--     moment someone confirms that phone number on GebetaSoccer;
--   * the invited player also sees the challenge in "Invitations for you".
-- Nobody is charged by an invite: the invited player still pays by joining.
-- Everything is read and written through the functions below (no direct table access).

create table if not exists public.challenge_invites (
  id            bigint generated always as identity primary key,
  challenge_id  bigint not null references public.challenges (id) on delete cascade,
  invited_by    uuid   not null references public.profiles (id) on delete cascade,
  phone         text   not null check (phone ~ '^\+251[79][0-9]{8}$'),
  user_id       uuid   references public.profiles (id) on delete set null,
  notified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (challenge_id, phone)
);
create index if not exists challenge_invites_user_idx  on public.challenge_invites (user_id) where user_id is not null;
create index if not exists challenge_invites_phone_idx on public.challenge_invites (phone) where user_id is null;

alter table public.challenge_invites enable row level security;
revoke all on public.challenge_invites from anon, authenticated;

-- ---- internal: write the notification for one invite ---------------------
create or replace function public.notify_challenge_invite(p_invite bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  i      public.challenge_invites;
  c      public.challenges;
  v_from text;
  v_n    int;
begin
  select * into i from public.challenge_invites where id = p_invite and user_id is not null and notified_at is null;
  if not found then return; end if;
  select * into c from public.challenges where id = i.challenge_id;
  if c.status <> 'open' or c.lock_at <= now() then return; end if;
  -- already joined: nothing to announce
  if exists (select 1 from public.challenge_entries e where e.challenge_id = c.id and e.user_id = i.user_id) then
    update public.challenge_invites set notified_at = now() where id = i.id;
    return;
  end if;
  select username into v_from from public.profiles where id = i.invited_by;
  select count(*) into v_n from public.challenge_matches where challenge_id = c.id;

  insert into public.notifications (user_id, kind, title, body, link)
  values (
    i.user_id,
    'challenge_invite',
    '🤝 ' || coalesce(v_from, 'A friend') || ' challenged you',
    '“' || c.title || '” · ' || v_n || case when v_n = 1 then ' match' else ' matches' end
      || ' · stake ' || public.fmt_etb(c.stake_units) || ' ETB. The winner gets their stake back + '
      || round((1 - c.fee_pct) * 100)::int || '% of the other stakes. Join before '
      || to_char(c.lock_at at time zone 'Africa/Addis_Ababa', 'Dy DD Mon HH24:MI') || ' EAT. Tap to see it and join.',
    '/challenges/' || c.code
  );
  update public.challenge_invites set notified_at = now() where id = i.id;
end $$;
revoke all on function public.notify_challenge_invite(bigint) from public, anon, authenticated;

-- ---- the creator invites phone numbers -----------------------------------
-- p_phones are already normalised (+2519XXXXXXXX / +2517XXXXXXXX) by the app.
-- Returns [{phone, status}] with status: notified | waiting_verify | not_on_app |
-- already_in | already_invited | self | invalid
create or replace function public.invite_to_challenge(p_code text, p_phones text[])
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  c        public.challenges;
  v_phone  text;
  v_pid    uuid;
  v_ver    timestamptz;
  v_known  boolean;
  v_id     bigint;
  v_status text;
  v_n      int;
  v_out    jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into c from public.challenges where code = upper(btrim(p_code));
  if not found then raise exception 'challenge not found'; end if;
  if c.creator_id <> v_uid then raise exception 'only the creator can invite'; end if;
  if c.status <> 'open' or c.lock_at <= now() then raise exception 'challenge closed'; end if;
  if p_phones is null or coalesce(array_length(p_phones, 1), 0) = 0 then raise exception 'no phone numbers'; end if;
  if array_length(p_phones, 1) > 10 then raise exception 'too many invites at once'; end if;

  select count(*) into v_n from public.challenge_invites where challenge_id = c.id;
  if v_n + array_length(p_phones, 1) > 30 then raise exception 'too many invites for this challenge'; end if;
  select count(*) into v_n from public.challenge_invites where invited_by = v_uid and created_at > now() - interval '24 hours';
  if v_n + array_length(p_phones, 1) > 60 then raise exception 'invite limit reached for today'; end if;

  foreach v_phone in array p_phones loop
    v_status := null;
    v_id := null;
    if v_phone is null or v_phone !~ '^\+251[79][0-9]{8}$' then
      v_status := 'invalid';
    else
      v_pid := null; v_ver := null;
      select id, phone_verified_at into v_pid, v_ver from public.profiles where phone_number = v_phone;
      v_known := v_pid is not null;
      if v_known and v_pid = v_uid then
        v_status := 'self';
      elsif v_known and exists (select 1 from public.challenge_entries e where e.challenge_id = c.id and e.user_id = v_pid) then
        v_status := 'already_in';
      else
        insert into public.challenge_invites (challenge_id, invited_by, phone, user_id)
        values (c.id, v_uid, v_phone, v_pid)
        on conflict (challenge_id, phone) do nothing
        returning id into v_id;
        if v_id is null then
          v_status := 'already_invited';
        elsif v_known and v_ver is not null then
          perform public.notify_challenge_invite(v_id);
          v_status := 'notified';
        elsif v_known then
          v_status := 'waiting_verify';   -- has an account but has not confirmed the phone yet
        else
          v_status := 'not_on_app';       -- delivered when they sign up and confirm this number
        end if;
      end if;
    end if;
    v_out := v_out || jsonb_build_object('phone', v_phone, 'status', v_status);
  end loop;
  return v_out;
end $$;
revoke all on function public.invite_to_challenge(text, text[]) from public, anon;
grant execute on function public.invite_to_challenge(text, text[]) to authenticated;

-- ---- a player's own open invitations ------------------------------------
create or replace function public.my_challenge_invites()
returns table (code text, title text, creator text, stake_units numeric, matches bigint, players bigint, lock_at timestamptz, invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.code, c.title, p.username, c.stake_units,
         (select count(*) from public.challenge_matches m where m.challenge_id = c.id),
         (select count(*) from public.challenge_entries e where e.challenge_id = c.id),
         c.lock_at, i.created_at
    from public.challenge_invites i
    join public.challenges c on c.id = i.challenge_id
    join public.profiles p on p.id = c.creator_id
   where i.user_id = auth.uid()
     and c.status = 'open' and c.lock_at > now()
     and not exists (select 1 from public.challenge_entries e where e.challenge_id = c.id and e.user_id = auth.uid())
   order by c.lock_at;
$$;
revoke all on function public.my_challenge_invites() from public, anon;
grant execute on function public.my_challenge_invites() to authenticated;

-- ---- the creator's list of who was invited -------------------------------
create or replace function public.challenge_invite_list(p_code text)
returns table (phone text, status text, invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.phone,
         case when i.user_id is not null and exists (select 1 from public.challenge_entries e where e.challenge_id = c.id and e.user_id = i.user_id) then 'joined'
              when i.user_id is not null then 'invited'
              else 'not_on_app' end,
         i.created_at
    from public.challenge_invites i
    join public.challenges c on c.id = i.challenge_id
   where c.code = upper(btrim(p_code)) and c.creator_id = auth.uid()
   order by i.created_at, i.id;
$$;
revoke all on function public.challenge_invite_list(text) from public, anon;
grant execute on function public.challenge_invite_list(text) to authenticated;

-- ---- a number that had no account: deliver the invites once it is confirmed ----
create or replace function public.challenge_invites_on_verify()
returns trigger
language plpgsql volatile security definer set search_path = public as $$
declare r record;
begin
  begin
    update public.challenge_invites set user_id = new.id where phone = new.phone_number and user_id is null;
    for r in select id from public.challenge_invites where user_id = new.id and notified_at is null loop
      perform public.notify_challenge_invite(r.id);
    end loop;
  exception when others then
    -- confirming a phone must never fail because of an invite
    raise warning 'challenge invites on verify: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.challenge_invites_on_verify() from public, anon, authenticated;

create or replace trigger profiles_challenge_invites
  after update of phone_verified_at on public.profiles
  for each row
  when (old.phone_verified_at is null and new.phone_verified_at is not null)
  execute function public.challenge_invites_on_verify();

-- make the new functions visible to the API right away
notify pgrst, 'reload schema';
