-- PeerXchange database schema
-- Applied to the Supabase project via the Supabase MCP `apply_migration` tool.
-- Kept here for reference / so it can be re-applied to a fresh project.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  bio text not null default '',
  skills_teach text[] not null default '{}',
  skills_learn text[] not null default '{}',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  skill text not null,
  proposed_date date,
  proposed_time time,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','declined','completed','cancelled')),
  rating int check (rating between 1 and 5),
  rating_comment text not null default '',
  created_at timestamptz not null default now(),
  constraint no_self_request check (from_user_id <> to_user_id)
);

create index requests_from_user_idx on public.requests(from_user_id);
create index requests_to_user_idx on public.requests(to_user_id);

alter table public.profiles enable row level security;
alter table public.requests enable row level security;

-- Anyone logged in can browse the marketplace of profiles.
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- You can edit your own profile...
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ...and an admin can edit anyone's (e.g. to grant/revoke admin).
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (true);

create policy "Admins can delete profiles"
  on public.profiles for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- A request is only visible to its two participants and admins.
create policy "Participants and admins can view requests"
  on public.requests for select
  to authenticated
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "Users can create their own requests"
  on public.requests for insert
  to authenticated
  with check (auth.uid() = from_user_id and status = 'pending' and rating is null);

create policy "Participants can update their requests"
  on public.requests for update
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id)
  with check (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
-- The extra fields (name, bio, skills) are passed through signUp()'s
-- `options.data` and land in `raw_user_meta_data`.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, bio, skills_teach, skills_learn)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    coalesce(
      (select array_agg(value) from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills_teach', '[]'::jsonb)) as value),
      '{}'
    ),
    coalesce(
      (select array_agg(value) from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills_learn', '[]'::jsonb)) as value),
      '{}'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Stop a user from granting themselves admin via a profile update.
create function public.prevent_is_admin_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_is_admin
  before update on public.profiles
  for each row execute procedure public.prevent_is_admin_escalation();

-- Enforce valid request status transitions and who is allowed to make them.
create function public.validate_request_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.from_user_id is distinct from old.from_user_id
     or new.to_user_id is distinct from old.to_user_id
     or new.skill is distinct from old.skill
     or new.message is distinct from old.message
     or new.proposed_date is distinct from old.proposed_date
     or new.proposed_time is distinct from old.proposed_time then
    raise exception 'Request details cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('accepted', 'declined') and old.status = 'pending' then
      if auth.uid() <> old.to_user_id then
        raise exception 'Only the tutor can accept or decline a request';
      end if;
    elsif new.status = 'completed' and old.status = 'accepted' then
      if auth.uid() <> old.to_user_id then
        raise exception 'Only the tutor can mark a session completed';
      end if;
    elsif new.status = 'cancelled' and old.status = 'pending' then
      if auth.uid() <> old.from_user_id then
        raise exception 'Only the requester can cancel a pending request';
      end if;
    else
      raise exception 'Invalid status transition from % to %', old.status, new.status;
    end if;
  end if;

  if new.rating is distinct from old.rating or new.rating_comment is distinct from old.rating_comment then
    if auth.uid() <> old.from_user_id then
      raise exception 'Only the requester can rate a session';
    end if;
    if old.status <> 'completed' then
      raise exception 'Can only rate completed sessions';
    end if;
    if old.rating is not null then
      raise exception 'Already rated';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_request_update_trigger
  before update on public.requests
  for each row execute procedure public.validate_request_update();

-- Peer-to-peer direct messaging between any two authenticated users.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint no_self_message check (sender_id <> recipient_id),
  constraint message_not_blank check (length(btrim(content)) > 0)
);

create index messages_sender_idx on public.messages(sender_id);
create index messages_recipient_idx on public.messages(recipient_id);
create index messages_conversation_idx on public.messages(least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);

alter table public.messages enable row level security;

-- Only the two participants in a conversation can see it.
create policy "Participants can view their messages"
  on public.messages for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "Users can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

-- A recipient can mark a message read; the trigger below stops them
-- (or the sender) from touching anything else on the row.
create policy "Recipients can mark messages read"
  on public.messages for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create function public.validate_message_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.content is distinct from old.content
     or new.created_at is distinct from old.created_at then
    raise exception 'Only read_at can be updated on a message';
  end if;
  return new;
end;
$$;

create trigger validate_message_update_trigger
  before update on public.messages
  for each row execute procedure public.validate_message_update();

-- Realtime so both participants see new messages live without a refresh.
alter publication supabase_realtime add table public.messages;

-- Auto-confirm emails so new users can enter the app right after registering.
create function public.auto_confirm_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;

create trigger auto_confirm_email_trigger before insert on auth.users
  for each row execute procedure public.auto_confirm_email();

-- Emails live only in auth.users; admins read them through this function.
create function public.admin_list_emails()
returns table (id uuid, email text) language sql security definer set search_path = public as $$
  select u.id, u.email::text from auth.users u
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin);
$$;

-- Fully removes a user (login + profile via cascade), admins only.
create function public.admin_delete_user(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Admins only';
  end if;
  if uid = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;
  delete from auth.users where id = uid;
end; $$;

revoke execute on function public.admin_list_emails(), public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_list_emails(), public.admin_delete_user(uuid) to authenticated;

-- Average rating per tutor. Requests are private to their two participants,
-- so this exposes only the aggregate, never the rows.
create function public.tutor_ratings()
returns table (to_user_id uuid, avg_rating numeric, rating_count bigint)
language sql security definer set search_path = public as $$
  select to_user_id, avg(rating)::numeric, count(*) from public.requests
  where status = 'completed' and rating is not null group by to_user_id;
$$;
revoke execute on function public.tutor_ratings() from public, anon;
grant execute on function public.tutor_ratings() to authenticated;

-- Size limits so one user cannot bloat every page load.
-- Skills: at most 30 items, each at most 100 characters.
create function public.skills_ok(a text[]) returns boolean language sql immutable as $$
  select coalesce(cardinality(a),0) <= 30 and coalesce((select max(length(s)) from unnest(a) s),0) <= 100
$$;
alter table public.profiles
  add constraint profile_name_len check (length(name) <= 100),
  add constraint profile_bio_len check (length(bio) <= 1000),
  add constraint profile_teach_len check (public.skills_ok(skills_teach)),
  add constraint profile_learn_len check (public.skills_ok(skills_learn));
alter table public.requests
  add constraint request_skill_len check (length(skill) <= 100),
  add constraint request_message_len check (length(message) <= 1000),
  add constraint request_comment_len check (length(rating_comment) <= 1000);
alter table public.messages add constraint message_len check (length(content) <= 2000);
