# DayHop V2

AI-powered local adventure companion for GTA families — Richmond Hill focus, World Cup 2026 phase.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and add your real `GROK_API_KEY` (from console.x.ai).

```bash
npm run dev      # with auto-restart (nodemon)
# or
npm start        # plain node
```

Visit http://localhost:3000

## Project structure

```
server.js              Express app entry point
routes/
  generate.js           POST /api/generate (ideas) + /api/generate/plan (day plan)
  places.js             Curated place data
  events.js              Curated/seed events (World Cup watch parties etc.)
  adventures.js          Saved day plans (in-memory store, swap for DB later)
  community.js           Community event submission + vetting queue
services/
  grok.js                 Grok (x.ai) API integration — prompt building + JSON parsing
public/
  index.html              App shell
  app.js                   Frontend logic: fetch, swipe, panels, shortlist, day plan
  css/main.css              Visual design (trail-map concept)
```

## What's real vs. seed data

- **AI idea generation and day-plan building are live** — calls Grok via `services/grok.js`. Will return a 503 with a clear message if `GROK_API_KEY` isn't set.
- **Places and Events routes are seed/in-memory data** — replace with a real database before relying on them for anything beyond local dev.
- **Adventures and Community routes use in-memory Maps/arrays** — data is lost on server restart. Swap for Postgres/Supabase before launch.
- **No auth yet** — shortlist persistence is per-browser via localStorage, and a random guest ID is generated to tag saved adventures server-side.

## Before real launch

1. Add a real database (Postgres via Supabase/Neon is a fast path) for places, events, adventures, and community submissions.
2. Add auth (Clerk, Supabase Auth, or similar) so shortlists/adventures survive across devices.
3. Lock down `/api/community/queue` and the approve/reject endpoints behind admin auth — currently open.
4. Add real venue data for Richmond Hill/GTA rather than relying solely on Grok's general knowledge for venue specifics — Grok is instructed not to fabricate exact business names, but a curated places DB will produce much more trustworthy specific recommendations.
5. Add analytics (PostHog/Plausible) to see where users drop off in the swipe → shortlist → build day funnel.
6. Add a proper error-tracking tool (Sentry) — current error handling logs to console only.
