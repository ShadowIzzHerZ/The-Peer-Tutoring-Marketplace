-- PeerXchange database schema
-- Applied to the Supabase project via the Supabase MCP `apply_migration` tool.
-- Kept here for reference / so it can be re-applied to a fresh project.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
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
  with check (auth.uid() = from_user_id);

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
  insert into public.profiles (id, name, email, bio, skills_teach, skills_learn)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
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

  if new.rating is distinct from old.rating then
    if auth.uid() <> old.from_user_id then
      raise exception 'Only the requester can rate a session';
    end if;
    if old.status <> 'completed' then
      raise exception 'Can only rate completed sessions';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_request_update_trigger
  before update on public.requests
  for each row execute procedure public.validate_request_update();
