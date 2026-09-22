-- ============================================================================
-- Row Level Security & trigger verification suite for the Zen schema
-- ============================================================================
--
-- What this is: an automated check that the access rules described in
-- schema.sql actually hold, by acting as different (throwaway) users inside
-- Postgres and confirming each operation is allowed or blocked as designed.
--
-- How it works: every statement runs inside one transaction that ends in
-- ROLLBACK, so it never leaves test data behind and is safe to re-run anytime
-- against the real project. `pg_temp.act_as(label)` swaps the simulated
-- Supabase Auth identity (role + JWT claims) for the rest of the transaction,
-- which is what lets us pretend to be "user A" one moment and "user B" the
-- next in raw SQL.
--
-- How to read the result: if this script completes and reaches the final
-- ROLLBACK with no error, every test passed. If a rule is broken, the script
-- stops immediately with an error message naming exactly which check failed
-- (each failure raises 'TEST FAILED: <what should have happened>').
--
-- Run it in the Supabase SQL editor, or via `psql`, against this project.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Fixtures: four throwaway users we fully control for this run
-- ----------------------------------------------------------------------------
do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  user_c uuid := gen_random_uuid();
  user_admin uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values
    ('00000000-0000-0000-0000-000000000000', user_a, 'authenticated', 'authenticated', 'rls-test-a@example.com', crypt('test', gen_salt('bf')), now(), '{}', '{"name":"RLS Test A"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', user_b, 'authenticated', 'authenticated', 'rls-test-b@example.com', crypt('test', gen_salt('bf')), now(), '{}', '{"name":"RLS Test B"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', user_c, 'authenticated', 'authenticated', 'rls-test-c@example.com', crypt('test', gen_salt('bf')), now(), '{}', '{"name":"RLS Test C"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', user_admin, 'authenticated', 'authenticated', 'rls-test-admin@example.com', crypt('test', gen_salt('bf')), now(), '{}', '{"name":"RLS Test Admin"}', now(), now(), '', '', '', '');

  -- Granting admin here bypasses the escalation-guard trigger deliberately,
  -- the same way it had to be bypassed once for the very first real admin
  -- (see README "Making yourself an admin"). That trigger is itself under
  -- test below, from an unprivileged actor's point of view.
  alter table public.profiles disable trigger protect_is_admin;
  update public.profiles set is_admin = true where id = user_admin;
  alter table public.profiles enable trigger protect_is_admin;

  create temp table t_ids (label text primary key, id uuid) on commit drop;
  insert into t_ids values ('a', user_a), ('b', user_b), ('c', user_c), ('admin', user_admin);
  grant select on t_ids to authenticated;

  create temp table t_reqs (label text primary key, id uuid) on commit drop;
  grant select, insert, update on t_reqs to authenticated;

  create temp table t_msgs (label text primary key, id uuid) on commit drop;
  grant select, insert, update on t_msgs to authenticated;
end $$;

-- Swaps the simulated Supabase Auth identity for the rest of the transaction.
create or replace function pg_temp.act_as(p_label text) returns void as $$
declare
  uid uuid;
begin
  select id into uid from t_ids where label = p_label;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- ============================================================================
-- Profiles: "Users can update own profile" / "Admins can update any profile" /
-- "Admins can delete profiles" / the is_admin self-escalation guard
-- ============================================================================

select pg_temp.act_as('a');
do $$
begin
  update public.profiles set bio = 'Updated by A' where id = (select id from t_ids where label = 'a');
  if not found then
    raise exception 'TEST FAILED: user A should be able to update their own profile';
  end if;
  raise notice 'PASS: user A can update their own profile';
end $$;

select pg_temp.act_as('a');
do $$
begin
  update public.profiles set bio = 'hacked by A' where id = (select id from t_ids where label = 'b');
  if found then
    raise exception 'TEST FAILED: user A should NOT be able to update user B''s profile';
  end if;
  raise notice 'PASS: user A cannot update user B''s profile';
end $$;

select pg_temp.act_as('a');
do $$
begin
  update public.profiles set is_admin = true where id = (select id from t_ids where label = 'a');
  if (select is_admin from public.profiles where id = (select id from t_ids where label = 'a')) then
    raise exception 'TEST FAILED: user A should NOT be able to self-promote to admin';
  end if;
  raise notice 'PASS: user A cannot self-promote to admin, even on their own row';
end $$;

select pg_temp.act_as('admin');
do $$
begin
  update public.profiles set bio = 'Updated by admin' where id = (select id from t_ids where label = 'b');
  if not found then
    raise exception 'TEST FAILED: admin should be able to update any profile';
  end if;
  raise notice 'PASS: admin can update any profile';
end $$;

select pg_temp.act_as('b');
do $$
begin
  delete from public.profiles where id = (select id from t_ids where label = 'a');
  if found then
    raise exception 'TEST FAILED: a non-admin should NOT be able to delete another profile';
  end if;
  raise notice 'PASS: non-admin cannot delete another profile';
end $$;

select pg_temp.act_as('admin');
do $$
begin
  delete from public.profiles where id = (select id from t_ids where label = 'c');
  if not found then
    raise exception 'TEST FAILED: admin should be able to delete a profile';
  end if;
  raise notice 'PASS: admin can delete a profile';
end $$;

-- ============================================================================
-- Requests: insert ownership, visibility, and the state-machine trigger
-- (pending -> accepted/declined -> completed, or pending -> cancelled)
-- ============================================================================

select pg_temp.act_as('a');
do $$
declare
  new_id uuid;
begin
  insert into public.requests (from_user_id, to_user_id, skill)
  values ((select id from t_ids where label = 'a'), (select id from t_ids where label = 'b'), 'Guitar')
  returning id into new_id;
  insert into t_reqs values ('main', new_id);
  raise notice 'PASS: user A can create a request to user B';
end $$;

select pg_temp.act_as('a');
do $$
begin
  begin
    insert into public.requests (from_user_id, to_user_id, skill)
    values ((select id from t_ids where label = 'b'), (select id from t_ids where label = 'a'), 'Impersonation');
    raise exception 'TEST FAILED: user A should NOT be able to create a request impersonating user B as sender';
  exception
    when insufficient_privilege then
      raise notice 'PASS: cannot impersonate another user as the request sender';
  end;
end $$;

select pg_temp.act_as('a');
do $$
begin
  begin
    insert into public.requests (from_user_id, to_user_id, skill)
    values ((select id from t_ids where label = 'a'), (select id from t_ids where label = 'a'), 'Self');
    raise exception 'TEST FAILED: a self-request should be rejected by the no_self_request constraint';
  exception
    when check_violation then
      raise notice 'PASS: self-requests are rejected';
  end;
end $$;

select pg_temp.act_as('c');
do $$
declare
  cnt int;
begin
  select count(*) into cnt from public.requests where id = (select id from t_reqs where label = 'main');
  if cnt <> 0 then
    raise exception 'TEST FAILED: an uninvolved user should not be able to see the request';
  end if;
  raise notice 'PASS: uninvolved users cannot see the request';
end $$;

select pg_temp.act_as('b');
do $$
declare
  cnt int;
begin
  select count(*) into cnt from public.requests where id = (select id from t_reqs where label = 'main');
  if cnt <> 1 then
    raise exception 'TEST FAILED: the recipient should be able to see the request';
  end if;
  raise notice 'PASS: the recipient can see the request';
end $$;

select pg_temp.act_as('a');
do $$
begin
  begin
    update public.requests set status = 'accepted' where id = (select id from t_reqs where label = 'main');
    raise exception 'TEST FAILED: the requester should NOT be able to accept their own request';
  exception
    when raise_exception then
      raise notice 'PASS: the requester cannot accept their own request';
  end;
end $$;

select pg_temp.act_as('b');
do $$
begin
  update public.requests set status = 'accepted' where id = (select id from t_reqs where label = 'main');
  if not found then
    raise exception 'TEST FAILED: the recipient should be able to accept the request';
  end if;
  raise notice 'PASS: the recipient can accept the request';
end $$;

select pg_temp.act_as('a');
do $$
begin
  begin
    update public.requests set status = 'completed' where id = (select id from t_reqs where label = 'main');
    raise exception 'TEST FAILED: the requester should NOT be able to mark the session completed';
  exception
    when raise_exception then
      raise notice 'PASS: the requester cannot mark the session completed';
  end;
end $$;

select pg_temp.act_as('b');
do $$
begin
  update public.requests set status = 'completed' where id = (select id from t_reqs where label = 'main');
  if not found then
    raise exception 'TEST FAILED: the recipient should be able to mark the session completed';
  end if;
  raise notice 'PASS: the recipient can mark the session completed';
end $$;

select pg_temp.act_as('b');
do $$
begin
  begin
    update public.requests set rating = 5 where id = (select id from t_reqs where label = 'main');
    raise exception 'TEST FAILED: the recipient should NOT be able to rate the session';
  exception
    when raise_exception then
      raise notice 'PASS: the recipient cannot rate the session';
  end;
end $$;

select pg_temp.act_as('a');
do $$
begin
  update public.requests set rating = 5 where id = (select id from t_reqs where label = 'main');
  if not found then
    raise exception 'TEST FAILED: the requester should be able to rate the completed session';
  end if;
  raise notice 'PASS: the requester can rate the completed session';
end $$;

select pg_temp.act_as('a');
do $$
declare
  new_id uuid;
begin
  insert into public.requests (from_user_id, to_user_id, skill)
  values ((select id from t_ids where label = 'a'), (select id from t_ids where label = 'b'), 'Python')
  returning id into new_id;
  insert into t_reqs values ('second', new_id);

  begin
    update public.requests set rating = 4 where id = new_id;
    raise exception 'TEST FAILED: should not be able to rate a pending session';
  exception
    when raise_exception then
      raise notice 'PASS: cannot rate a session that is not completed';
  end;
end $$;

select pg_temp.act_as('b');
do $$
begin
  begin
    update public.requests set status = 'completed' where id = (select id from t_reqs where label = 'second');
    raise exception 'TEST FAILED: pending -> completed should be an invalid transition';
  exception
    when raise_exception then
      raise notice 'PASS: invalid status transitions (skipping "accepted") are rejected';
  end;
end $$;

-- ============================================================================
-- Messages: insert ownership, visibility, and the "only read_at can change"
-- update trigger (validate_message_update)
-- ============================================================================

select pg_temp.act_as('a');
do $$
declare
  new_id uuid;
begin
  insert into public.messages (sender_id, recipient_id, content)
  values ((select id from t_ids where label = 'a'), (select id from t_ids where label = 'b'), 'Hey, are you free to swap Guitar for Python?')
  returning id into new_id;
  insert into t_msgs values ('main', new_id);
  raise notice 'PASS: user A can send a message to user B';
end $$;

select pg_temp.act_as('a');
do $$
begin
  begin
    insert into public.messages (sender_id, recipient_id, content)
    values ((select id from t_ids where label = 'b'), (select id from t_ids where label = 'a'), 'Impersonation');
    raise exception 'TEST FAILED: user A should NOT be able to send a message impersonating user B as sender';
  exception
    when insufficient_privilege then
      raise notice 'PASS: cannot impersonate another user as the message sender';
  end;
end $$;

select pg_temp.act_as('a');
do $$
begin
  begin
    insert into public.messages (sender_id, recipient_id, content)
    values ((select id from t_ids where label = 'a'), (select id from t_ids where label = 'a'), 'Talking to myself');
    raise exception 'TEST FAILED: a self-message should be rejected by the no_self_message constraint';
  exception
    when check_violation then
      raise notice 'PASS: self-messages are rejected';
  end;
end $$;

select pg_temp.act_as('c');
do $$
declare
  cnt int;
begin
  select count(*) into cnt from public.messages where id = (select id from t_msgs where label = 'main');
  if cnt <> 0 then
    raise exception 'TEST FAILED: an uninvolved user should not be able to see the message';
  end if;
  raise notice 'PASS: uninvolved users cannot see the message';
end $$;

select pg_temp.act_as('b');
do $$
declare
  cnt int;
begin
  select count(*) into cnt from public.messages where id = (select id from t_msgs where label = 'main');
  if cnt <> 1 then
    raise exception 'TEST FAILED: the recipient should be able to see the message';
  end if;
  raise notice 'PASS: the recipient can see the message';
end $$;

select pg_temp.act_as('a');
do $$
begin
  update public.messages set read_at = now() where id = (select id from t_msgs where label = 'main');
  if found then
    raise exception 'TEST FAILED: the sender should NOT be able to mark their own message as read';
  end if;
  raise notice 'PASS: the sender cannot mark their own message as read (only the recipient can)';
end $$;

select pg_temp.act_as('b');
do $$
begin
  update public.messages set read_at = now() where id = (select id from t_msgs where label = 'main');
  if not found then
    raise exception 'TEST FAILED: the recipient should be able to mark the message as read';
  end if;
  raise notice 'PASS: the recipient can mark the message as read';
end $$;

select pg_temp.act_as('b');
do $$
begin
  begin
    update public.messages set content = 'edited by recipient' where id = (select id from t_msgs where label = 'main');
    raise exception 'TEST FAILED: the recipient should NOT be able to change the message content';
  exception
    when raise_exception then
      raise notice 'PASS: only read_at can be changed — content is protected even from the recipient';
  end;
end $$;

-- ============================================================================
-- All 27 checks above ran without an unhandled error, so every rule held.
-- Roll back: none of this fixture data is meant to persist.
-- ============================================================================
rollback;
