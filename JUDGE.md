# Zen — Student Skill Exchange / Peer Tutoring Marketplace

A guide for evaluators: what this project is, how it's built, how to verify
it actually works, and where to look for what.

---

## 1. What problem this solves

**Problem statement (assigned):** *Student Skill Exchange / Peer Tutoring
Marketplace* — a platform connecting students who can teach a skill with
students who want to learn it, with profiles, search, session requests, and
ratings.

**What we built:** Zen is a full marketplace where any student can:

- List the skills they can **teach** and the skills they want to **learn**
- Browse/search other students by name, skill, or bio
- Send a session request to a peer for a specific skill, with a proposed
  date/time and a message
- Have that request go through a real lifecycle: **pending → accepted/
  declined → completed** (or **pending → cancelled**)
- Rate a completed session (1–5 stars), which feeds into that peer's public
  average rating shown on their profile card
- **Message any other student directly**, with messages appearing live on
  both ends — no page refresh needed (see [§9](#9-real-time-peer-messaging))
- See platform-wide stats and manage users as an **admin**

Every one of those rules (who can send a request, who can accept it, who can
rate it, who can promote someone to admin) is enforced **in the database**,
not just hidden/disabled in the UI — see [§5](#5-the-part-worth-asking-about-in-the-viva-security).

## 2. Live links

| | |
|---|---|
| **Repository** | https://github.com/ShadowIzzHerZ/The-Peer-Tutoring-Marketplace |
| **Database** | Supabase (Postgres + Auth + Row Level Security) |
| **Hosting** | Static site — deployable to GitHub Pages or AWS Amplify with zero configuration (no build step, no server) |

## 3. Try it live — demo accounts

No sign-up needed to evaluate the app. All demo accounts use password
**`password123`**:

| Email | Role |
|---|---|
| `rohan.test@example.com` | Teaches Guitar & Music Theory — has a real 5★ rating from a completed session |
| `ssohamranjan+ptmtest1@gmail.com` | Teaches Data Structures & Python |
| `priya.sharma.demo@example.com` | Teaches Mathematics & Statistics |
| `dilshad.ahmed.demo@example.com` | Teaches Physics & Cricket Coaching |
| `mohammed.ali.demo@example.com` | Teaches Web Design & Photography |

Suggested walkthrough: log in as one account → **Browse** → open another
peer's card → **Request Session** → log in as *that* peer → **Requests →
Received** → Accept → Mark Completed → log back in as the requester →
**Requests → Sent** → rate the session with stars → check their profile card
on **Browse** again to see the rating update live.

## 4. Tech stack

- **Frontend:** plain HTML, CSS, and JavaScript — no framework, no build
  step, no `node_modules`. Every page is a static file you can open directly.
- **Styling:** Tailwind CSS (via CDN, JIT-compiled in the browser) with a
  custom design token system driven entirely by **CSS variables**, which is
  what makes dark mode possible without touching a single class on any page
  (see [§7](#7-dark-mode--how-it-actually-works)).
- **Backend:** none, on purpose. [Supabase](https://supabase.com) (managed
  Postgres + Auth + auto-generated REST API) is called **directly from the
  browser** via `@supabase/supabase-js`. All the "backend logic" a typical
  app would put in server code instead lives in Postgres itself: Row Level
  Security policies and trigger functions.
- **Hosting:** any static file host works — GitHub Pages, AWS Amplify, or
  literally opening `index.html`. There is nothing to deploy except files.

## 5. The part worth asking about in the viva: security

This is the part of the project most worth interrogating, because it's easy
to *say* "users can only edit their own data" and much harder to actually
guarantee it. Here, the guarantee comes from Postgres, not from the
JavaScript trusting itself:

- **Row Level Security (RLS)** is enabled on every table. A logged-in user's
  requests to the database are filtered by policy *before* any row reaches
  them — the client-side JavaScript has no special privilege, it's using the
  exact same public API key (`js/config.js`) that anyone could copy out of
  the page source. Security doesn't depend on hiding that key.
- **Two trigger functions** enforce rules a simple `SELECT`/`UPDATE` policy
  can't express on its own:
  - `prevent_is_admin_escalation` — silently reverts any attempt to set
    `is_admin = true` on a row unless the person making the change is
    *already* an admin. This was tested for real during development: even a
    direct SQL `UPDATE` run from an unauthenticated context got reverted by
    this trigger, and it had to be deliberately disabled to grant the very
    first admin.
  - `validate_request_update` — enforces the entire request state machine
    (who can accept, who can decline, who can mark complete, who can rate,
    and that you can't skip a step) at the database layer.
- **`supabase/rls_tests.sql`** is an automated proof of all of this: it acts
  as several different throwaway users inside Postgres and asserts that every
  boundary holds — cross-user profile edits are blocked, self-promotion to
  admin is blocked, only the tutor can accept/decline/complete a request,
  only the requester can cancel or rate one, and invalid status transitions
  are rejected. It runs inside a transaction that always ends in `ROLLBACK`,
  so it's safe to re-run anytime with no side effects. If every rule holds it
  finishes silently; if one breaks, it stops immediately naming exactly which
  check failed. This was run against the live database and passed all 20
  checks before being committed.

Full policy definitions are in `supabase/schema.sql`, commented to explain
the intent of each one.

## 6. Data model

Two tables carry the whole app:

- **`profiles`** — one row per user (linked 1:1 to Supabase Auth via a
  foreign key on `id`). Holds `name`, `bio`, `skills_teach[]`,
  `skills_learn[]`, `is_admin`. A row is created automatically by a trigger
  the moment someone signs up — the extra profile fields ride along in the
  sign-up call's metadata.
- **`requests`** — one row per session request: `from_user_id` (requester),
  `to_user_id` (tutor), `skill`, `proposed_date`/`proposed_time`, `message`,
  `status`, `rating` (1–5, nullable until rated), `rating_comment`. A `check`
  constraint rejects a request where `from_user_id = to_user_id` (no
  self-requests).

Everything else — dashboard stats, the browse page's average-rating badge,
the admin tables — is just a query or aggregate over these two tables.

## 7. Dark mode — how it actually works

Rather than adding a `dark:` Tailwind variant to every single class on every
page (hundreds of edits, easy to miss spots), every color in the design
system is defined as a CSS custom property (`css/theme.css`) and the Tailwind
config (`js/tailwind-config.js`) points every color name at
`var(--color-*)` instead of a hex value. Toggling dark mode just adds a
`.dark` class to `<html>`, which swaps ~60 CSS variables at once — every
element on the page re-themes automatically with **zero markup changes**.
The choice is written to `localStorage` and applied by a tiny blocking script
(`js/theme-init.js`) before the page paints, so there's no flash of the wrong
theme on load, and a short CSS transition makes the switch feel smooth
instead of an abrupt flip.

## 8. Multi-language support

A language switcher in the header supports **English, Hindi, Bengali,
Punjabi, Marathi, and Tamil** — full parity, 174 translated strings per
language (`js/i18n.js`), covering every page including dynamically-rendered
content like status badges ("pending"/"accepted"/…) and browse-page cards.
Static text is tagged with `data-i18n="key"` attributes; dynamic content
calls a shared `t(key)` lookup and re-renders on a language-change event. The
choice persists in `localStorage`.

## 9. Real-time peer messaging

Beyond the one-time message attached to a session request, any student can
open a direct conversation with any other student from **Messages** in the
nav bar — or via the **Message** button on a browse card or a request row,
which jumps straight into that conversation.

- Conversations are computed on the fly from a single `messages` table
  (`sender_id`, `recipient_id`, `content`, `read_at`) — there's no separate
  "conversation" object to keep in sync.
- **Supabase Realtime** is enabled on the table, and the client subscribes to
  `postgres_changes` INSERT events filtered to the signed-in user. A new
  message appears in the open thread — or as an unread badge on the
  conversation list and the **Messages** nav link — the instant it's sent, on
  both accounts, with no polling and no page refresh.
- The same RLS model applies here as everywhere else: a `select` policy
  limits every row to its two participants, an `insert` policy only lets you
  send as yourself, and an `update` policy plus a trigger
  (`validate_message_update`) together mean a recipient can flip `read_at`
  to mark a message read but cannot alter who sent what to whom.

## 10. Project structure

```
peer-tutoring-marketplace/
├── index.html              Landing page
├── register.html           Sign up (skill-tag inputs, email confirmation state)
├── login.html               Log in
├── dashboard.html           Logged-in home: stats, bio card, quick links, recent requests
├── profile.html              Edit profile & change password
├── browse.html                Marketplace grid, search/filter, request modal
├── requests.html               Received / Sent tabs, accept/decline/rate
├── messages.html                 Direct messaging: conversation list + live chat
├── admin.html                      Platform stats, user table, all-requests table
├── css/
│   ├── theme.css              Light/dark CSS variable definitions + transitions
│   └── extra.css               Small custom rules (icons, nav, toast, star widget)
├── js/
│   ├── config.js               Supabase client (project URL + public anon key)
│   ├── app.js                   Shared utilities (tag rendering, status badges, average rating)
│   ├── nav.js                    Nav bar, auth guards, dark-mode toggle wiring
│   ├── i18n.js                    Translation dictionary + language switcher logic
│   ├── theme-init.js               Pre-paint dark-mode class application (no flash)
│   ├── tailwind-config.js           Design tokens, all pointing at CSS variables
│   ├── messages.js                   Conversation list, chat thread, Realtime subscription
│   └── login.js, register.js, dashboard.js, profile.js, browse.js, requests.js, admin.js
│                                    Page-specific controllers
├── supabase/
│   ├── schema.sql                Full schema, RLS policies, triggers (source of truth)
│   └── rls_tests.sql              Automated security verification suite
├── amplify.yml                  AWS Amplify Hosting build config (no build step needed)
└── README.md                   Setup, local dev, and deployment instructions
```

## 11. Running it locally

No build step, no dependencies to install:

```bash
npx serve .
```

or just open `index.html` directly in a browser. The app talks to the live
Supabase project already configured in `js/config.js`.

## 12. What's intentionally out of scope

To keep the implementation honest about what's real versus decorative:

- No group chats or file/image attachments in messages — text only, one peer
  at a time
- No calendar/scheduling integration — a proposed date/time is just stored,
  not synced to any calendar
- No email notifications (Supabase Auth's own confirmation email is the only
  email sent)

These were left out deliberately rather than half-built, in line with the
assignment's expectation of a complete, working solution over a padded
feature list.
