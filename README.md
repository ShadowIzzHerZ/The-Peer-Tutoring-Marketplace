# Zen - Student Skill Exchange / Peer Tutoring Marketplace

A platform where students trade skills instead of paying for tutoring. You
list what you can teach and what you want to learn, find someone with a
matching skill, send them a session request, and rate the session once it's
done.

## Tech stack

- Frontend: plain HTML/CSS/JS, no framework, no build step
- Backend: Supabase (Postgres + Auth + Row Level Security), called straight
  from the browser with `@supabase/supabase-js`
- Hosting: AWS Amplify (link below), would work fine on GitHub Pages too

## Features

- Login/signup with Supabase Auth
- Edit your profile: bio, skills you teach, skills you want to learn
- Browse other students, search by name/skill/bio
- Send a session request, accept/decline it, mark it completed, rate it
- Received and Sent tabs on the Requests page with status badges
- Direct messaging between any two students, updates live using Supabase
  Realtime (no refresh needed)
- Admin page: stats, user list, all requests, remove a user
- The important rules are enforced in the database with Row Level Security,
  not just hidden in the UI:
  - you can only edit your own profile
  - only the tutor can accept/decline/complete a request
  - only the requester can cancel or rate one
  - nobody can make themselves admin

## Live deployment

Deployed on AWS Amplify: https://main.d1lbffpnvsb54h.amplifyapp.com/

This isn't connected to GitHub, so it won't auto-update on new pushes. To
push a new version, redeploy the `main` branch zip to the same Amplify app
(`appId: d1lbffpnvsb54h`, `us-east-1`). Connecting the repo through the
Amplify console would give proper auto-deploy on push, just wasn't set up
for this project.

## Project structure

```
peer-tutoring-marketplace/
├── index.html          Landing page
├── register.html       Sign up
├── login.html           Log in
├── dashboard.html       Logged-in home / stats
├── profile.html         Edit profile & password
├── browse.html           Marketplace + request modal
├── requests.html         Received / Sent tabs
├── messages.html          Direct messaging
├── admin.html              Admin dashboard
├── css/
├── js/
│   ├── config.js        Supabase client (URL + anon key)
│   ├── app.js            Shared helpers
│   ├── nav.js             Nav bar + auth guards
│   ├── auth.js             Login/register logic
│   ├── messages.js          Messaging + Realtime
│   └── dashboard.js, profile.js, browse.js, requests.js, admin.js
└── supabase/schema.sql  DB schema, RLS policies & triggers
```

## Running locally

No build step. Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Supabase setup

Already pointed at our live Supabase project in `js/config.js`. The anon key
in there is public and fine to commit, the real security is the RLS policies
in `supabase/schema.sql`, not the key being secret.

Before demoing, turn off "Confirm email" in the Supabase dashboard
(Authentication → Providers → Email), otherwise new signups can't log in
until they click a confirmation link.

### Making yourself admin

No button for this on purpose. After signing up, run this once in the SQL
editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

### Pointing this at a different Supabase project

Run `supabase/schema.sql` in the new project's SQL editor, then update
`SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/config.js`.

## Deploying elsewhere (GitHub Pages)

It's static files, so this works too:

1. Push the repo to GitHub
2. Settings → Pages → set Source to the `main` branch
3. Live at `https://<username>.github.io/<repo-name>/`

No env vars or build step needed, the Supabase key is already in `js/config.js`.

## Security tests

`supabase/rls_tests.sql` runs a bunch of checks straight against the live DB
to prove the RLS policies and triggers actually work: can't edit someone
else's profile, can't self-promote to admin, can't accept your own request,
can't rate a session that isn't completed, can't see or send a message
you're not part of, and a few more like that.

It runs inside a transaction that ends in `ROLLBACK`, so it never leaves
test data behind and is safe to re-run anytime. No error at the end means
every check passed.

## Notes

- No custom backend. Supabase handles auth, data, and permissions.
- Two main tables: `profiles` and `requests`, plus `messages` for chat.
- Requests go pending -> accepted/declined -> completed, or pending -> cancelled.
- RLS policies plus a couple of trigger functions in `schema.sql` are what
  actually stop people from doing things they shouldn't, worth pointing at
  that file if anyone asks how the security works.
