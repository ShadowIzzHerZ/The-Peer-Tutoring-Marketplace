# Zen — Student Skill Exchange / Peer Tutoring Marketplace

A web platform that connects students who can teach a skill with students who
want to learn it. Users create a profile listing skills they can teach and
skills they want to learn, browse and search other peers, send session
requests, accept/decline/complete them, and rate completed sessions.

## Tech stack

- **Frontend:** plain HTML, CSS, JavaScript (no build step, no framework)
- **Backend:** [Supabase](https://supabase.com) — Postgres database, Auth, and
  Row Level Security, called directly from the browser via `@supabase/supabase-js`
- **Hosting:** static hosting (GitHub Pages) — the frontend talks to Supabase
  directly, there is no separate server to deploy

## Features

- Email/password authentication (Supabase Auth)
- Profile management — bio, skills you can teach, skills you want to learn
- Marketplace browse page with search + skill filter
- Session request flow: send → accept/decline → mark completed → rate
- "Received" and "Sent" request tabs with live status badges
- Direct peer-to-peer messaging with live delivery via Supabase Realtime —
  message any student from Browse, Requests, or the Messages nav link
- Admin dashboard: platform stats, user list with ratings, all requests, remove a user
- Database-enforced rules (Row Level Security + triggers), not just UI checks:
  - You can only edit your own profile
  - Only the tutor can accept/decline/complete a request
  - Only the requester can cancel a pending request or rate a completed one
  - A user cannot grant themselves admin

## Project structure

```
peer-tutoring-marketplace/
├── index.html          Landing page
├── register.html        Sign up
├── login.html            Log in
├── dashboard.html        Logged-in home / stats
├── profile.html          Edit profile & password
├── browse.html            Marketplace + request modal
├── requests.html          Received / Sent tabs
├── messages.html           Direct messaging (conversation list + live chat)
├── admin.html                Admin dashboard
├── css/style.css
├── js/
│   ├── config.js        Supabase client (URL + anon key)
│   ├── app.js            Shared utilities
│   ├── nav.js             Nav bar + auth guards
│   ├── auth.js             Login/register logic
│   ├── dashboard.js, profile.js, browse.js, requests.js, admin.js
└── supabase/schema.sql  Full DB schema, RLS policies & triggers (reference)
```

## Running locally

No build step needed. Just open `index.html` in a browser, or serve the folder
with any static server, e.g.:

```bash
npx serve .
```

## Supabase setup

The project already points at a live Supabase project (see `js/config.js`).
The anon key in that file is a **public** key — it is safe to commit, because
all access control is enforced by Row Level Security policies in the database
(see `supabase/schema.sql`), not by hiding the key.

**Before demoing/submitting, disable email confirmation** so sign-ups can log
in immediately: in the Supabase dashboard, go to
**Authentication → Sign In / Providers → Email** and turn off **Confirm email**.
Otherwise every new account needs to click a confirmation link first.

### Making yourself an admin

There's no public "become admin" button (by design). After you sign up through
the app, run this once in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

### Recreating the schema elsewhere

If you ever need to point this at a different Supabase project, run the SQL in
`supabase/schema.sql` in the new project's SQL editor, then update
`SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/config.js`.

## Deployment (GitHub Pages)

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**, set **Source** to the `main`
   branch (root), and save.
3. The site will be live at `https://<username>.github.io/<repo-name>/`.

No environment variables or build step are required since the Supabase
anon key is already embedded in `js/config.js`.

## Verifying the security model

`supabase/rls_tests.sql` is an automated test suite that proves the Row Level
Security policies and triggers in `schema.sql` actually behave as designed —
it acts as several different (throwaway) users inside Postgres and checks
that every permission boundary holds (e.g. a user can't update someone else's
profile, can't grant themselves admin, can't accept their own session
request, can't rate a session that isn't completed, and so on).

Run it in the Supabase SQL editor. It runs inside a transaction that always
ends in `ROLLBACK`, so it's safe to re-run at any time — it never leaves test
data behind. If every rule holds, it completes with no error; if one is
broken, it stops immediately with a message naming exactly which check
failed.

## Notes for the viva

- Auth, data storage, and access control all run through Supabase — there is
  no custom backend server.
- Data model: `profiles` (one row per user, linked to Supabase Auth) and
  `requests` (one row per session request, with a `status` state machine:
  `pending → accepted/declined → completed`, or `pending → cancelled`).
  Ratings are attached directly to a completed request.
- Row Level Security policies and two `before update` trigger functions
  enforce who can do what at the database level — worth walking through
  `supabase/schema.sql` to explain the security model.
- Messaging (`messages` table) reuses the same pattern: RLS restricts every
  row to its two participants, and Supabase Realtime pushes new rows to the
  recipient's browser live, without polling.
