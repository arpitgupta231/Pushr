# Pushr

**Grow with your BRO.**

Pushr is a web app for developers who want to build alongside a friend and keep each other moving. Connect GitHub, choose a rival, and follow each other's progress through a six-month rivalry.

## What Pushr does

- Sign in using GitHub App user authorization.
- Sync GitHub profile stats, repositories, contribution history, streaks, and mutual follows.
- Send and respond to rivalry requests, then view an active rivalry and its scores.
- Store GitHub activity events and derived user and rivalry data in PostgreSQL.
- Receive activity and repository updates through signed GitHub App webhooks.

A rivalry is intended to run for six months after both users accept. Completed rivalries are retained as history. Scoring rules are still evolving, so activity points should not be treated as a finalized ranking system.

## Tech stack

- Next.js 16 with React 19
- NextAuth with GitHub OAuth
- PostgreSQL and Prisma
- GitHub REST and Web Push APIs

## Activity syncing

Set `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` for regular GitHub OAuth login, then set `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` (the legacy `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` names are accepted as fallbacks), plus `GITHUB_WEBHOOK_SECRET`, and `NEXT_PUBLIC_GITHUB_APP_SLUG` for the GitHub App authorization and webhooks. Configure regular OAuth callback to `${NEXTAUTH_URL}/api/auth/callback/github-oauth`, GitHub App OAuth callback to `${NEXTAUTH_URL}/api/auth/callback/github-app`, GitHub App Setup URL to `${NEXTAUTH_URL}/api/github/installation`, and webhook URL to `${NEXTAUTH_URL}/api/github/webhook`. Subscribe to `push`, `pull_request`, `pull_request_review`, `issues`, `star`, `fork`, `create`, and `repository` events. No scheduled activity polling is used.

## Project structure

```text
app/                 Pages, layouts, and API routes
  api/               Auth, rivalry, activity, and stats handlers
  dashboard/         Main signed-in dashboard
  rival/             Rivalry view
lib/                 GitHub integration, auth, stats, repos, and Prisma client
prisma/schema.prisma PostgreSQL data model
```

## Product direction

Pushr is designed around mutual motivation rather than a generic leaderboard. Personal GitHub stats and rivalry scores are separate, mutual GitHub follows are the friends list, and GitHub remains the source of truth for repository code and commit history. Browser push notifications and richer repository history views are planned product directions; check the app implementation before assuming they are available in the current build.

