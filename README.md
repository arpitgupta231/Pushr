# Pushr

**Grow with your BRO.**

Pushr is a web app for developers who want to build alongside a friend and keep each other moving. Connect GitHub, choose a rival, and follow each other's progress through a six-month rivalry.

## What Pushr does

- Sign in with GitHub OAuth.
- Sync GitHub profile stats, repositories, contribution history, streaks, and mutual follows.
- Send and respond to rivalry requests, then view an active rivalry and its scores.
- Store GitHub activity events and derived user and rivalry data in PostgreSQL.
- Poll the GitHub Events API from a scheduled activity route for lightweight activity syncing.

A rivalry is intended to run for six months after both users accept. Completed rivalries are retained as history. Scoring rules are still evolving, so activity points should not be treated as a finalized ranking system.

## Tech stack

- Next.js 16 with React 19
- NextAuth with GitHub OAuth
- PostgreSQL and Prisma
- GitHub REST and GraphQL APIs

## Run locally

### Requirements

- Node.js and npm
- A PostgreSQL database
- A GitHub OAuth app with a callback URL of `http://localhost:3000/api/auth/callback/github`

### Configure environment

Create `.env` in the project root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
GITHUB_ID="your-github-oauth-client-id"
GITHUB_SECRET="your-github-oauth-client-secret"
NEXTAUTH_SECRET="a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
GITHUB_TOKEN="optional-token-for-server-side-github-requests"
CRON_SECRET="secret-used-to-authorize-the-activity-cron-route"
GITHUB_WEBHOOK_SECRET="optional-webhook-signing-secret"
```

`GITHUB_TOKEN` is optional; signed-in users' OAuth tokens are used for user-specific GitHub requests where available. `CRON_SECRET` protects the scheduled activity route. `GITHUB_WEBHOOK_SECRET` is only needed if configuring the optional webhook endpoint.

### Install and start

```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database note

This project uses a shared PostgreSQL database whose migration history is not fully aligned with the current schema. Use `npm run db:push` for schema updates. **Do not run `npm run db:migrate`**: `prisma migrate dev` may request a destructive database reset.

## Activity syncing

The activity polling handler is at `/api/cron/activities` and is intended to be called by a scheduled job such as Vercel Cron, with the configured `CRON_SECRET`. GitHub's Events API is delayed and has a limited event history, so activity updates are not real-time. The repository also contains an optional GitHub webhook handler at `/api/webhook/github`; Events API polling remains the lightweight V1 approach.

## Project structure

```text
app/                 Pages, layouts, and API routes
  api/               Auth, rivalry, activity, stats, and webhook handlers
  dashboard/         Main signed-in dashboard
  rival/             Rivalry view
lib/                 GitHub integration, auth, stats, repos, and Prisma client
prisma/schema.prisma PostgreSQL data model
```

## Product direction

Pushr is designed around mutual motivation rather than a generic leaderboard. Personal GitHub stats and rivalry scores are separate, mutual GitHub follows are the friends list, and GitHub remains the source of truth for repository code and commit history. Browser push notifications and richer repository history views are planned product directions; check the app implementation before assuming they are available in the current build.
