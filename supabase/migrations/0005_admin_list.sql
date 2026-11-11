-- Admin ("god mode") list. Anyone whose email is here is an admin —
-- immediately if they already have an account, or as soon as they sign up.
-- To add another admin later:
--   insert into public.admin_emails (email) values ('someone@example.com');
-- To remove one:
--   delete from public.admin_emails where email = 'someone@example.com';

create table if not exists public.admin_emails (
  email      text primary key check (email = lower(email)),
  added_at   timestamptz not null default now()
);
alter table public.admin_emails enable row level security;  -- no policies: invisible to browsers

-- Keep profiles.is_admin in sync whenever the list changes.
create or replace function public.sync_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.profiles p set is_admin = true
      from auth.users u
     where u.id = p.id and lower(u.email) = new.email;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    update public.profiles p set is_admin = false
      from auth.users u
     where u.id = p.id and lower(u.email) = old.email
       and (tg_op = 'DELETE' or old.email <> new.email);
  end if;
  return null;
end $$;

drop trigger if exists admin_emails_sync on public.admin_emails;
create trigger admin_emails_sync after insert or update or delete on public.admin_emails
for each row execute function public.sync_admin_flag();

-- New sign-ups on the list become admin straight away.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, phone_number, email, is_admin)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'player_' || substr(replace(new.id::text, '-', ''), 1, 8)),
    coalesce(new.phone, nullif(new.raw_user_meta_data ->> 'phone_number', '')),
    case when new.email like '%.invalid' then null else new.email end,
    exists (select 1 from public.admin_emails a where a.email = lower(new.email))
  );
  return new;
end $$;

-- First admin.
insert into public.admin_emails (email) values ('sofoniasmengistu@gmail.com')
on conflict do nothing;
