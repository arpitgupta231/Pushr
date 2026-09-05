<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pushr Project Context

## Product

Pushr is a web app for developers built around the idea:

> Grow with your BRO.

Users connect their GitHub account and select another developer as their "rival" or bro.

The rivalry is intentionally competitive, but the core purpose is mutual motivation and growth rather than ranking developers.

The product should feel somewhat like a 6-month ranked FPS match:

- Two users lock into a rivalry.
- The rivalry lasts exactly 6 months.
- Once accepted, neither user can cancel, leave, or change the rivalry.
- The rivalry ends automatically after 6 months.
- The historical rivalry and result should remain available afterward.

## Core Product Loop

```text
User connects GitHub
        ↓
Selects another GitHub user
        ↓
Sends rivalry request
        ↓
Other user accepts
        ↓
6-month rivalry begins
        ↓
GitHub activity is tracked
        ↓
Activity updates personal stats + rivalry scores
        ↓
Other user receives notification
        ↓
Both developers stay motivated
```

The central emotional/product idea is:

> Your progress pushes theirs, and their progress pushes yours.

## Current MVP Direction

This is a web application, not a desktop/Tauri application.

Browser push notifications should be used for notifications.

Tauri may be considered later, but it is not part of V1.

## GitHub Activity Detection

For V1, use GitHub's Events API with periodic polling.

Do not over-engineer the first version with GitHub App webhooks unless explicitly decided later.

The current proposed architecture is:

```text
Vercel Cron
    ↓
GitHub Events API
    ↓
Detect new activity
    ↓
Activities table
    ↓
Update stats / rivalry score
    ↓
Browser push notification
```

The Events API is not truly real-time, so notifications may be delayed. This is acceptable for V1.

The important goal is to keep the architecture lightweight.

## Database

PostgreSQL is the chosen database.

Prisma or another PostgreSQL ORM can be used.

The current conceptual database has these core tables.

### Users

Stores GitHub identity and personal statistics.

```text
users

id
github_id
github_username
email

following_count
starred_repo_count

total_commits
current_streak
longest_streak

created_at
updated_at
```

These are derived by the application:

```text
total_commits
current_streak
longest_streak
```

These are GitHub-sourced/synced profile statistics:

```text
following_count
starred_repo_count
```

The app calculates its own streaks rather than assuming GitHub provides a `current_streak` or `PR_streak` field.

Do not include an artificial Bronze/Silver/Gold rank system because GitHub already has its own reputation/status mechanisms.

### Rivalries

A rivalry represents a locked 6-month competition between two users.

```text
rivalries

id

user1_id
user2_id

status

started_at
ends_at

rivalry_score
user1_score
user2_score

created_at
updated_at
```

Rivalry rules:

- `user1_id` and `user2_id` must be different.
- A user can only have one active rivalry.
- Once accepted and active, the rivalry cannot be cancelled.
- The rivalry lasts 6 months.
- `started_at` represents when both users accept/lock in.
- `ends_at` represents the end of the 6-month period.
- Completed rivalries remain permanently in the database as history.

Scores:

- `user1_score` is the score earned by user 1 during this rivalry.
- `user2_score` is the score earned by user 2 during this rivalry.
- `rivalry_score` represents the total intensity/activity of the rivalry.

Conceptually:

```text
rivalry_score = user1_score + user2_score
```

These scores are derived from GitHub activities.

### Repositories

Stores repositories relevant to the user's GitHub account, particularly repositories they created or forked.

Conceptually:

```text
repositories

id

github_repo_id
user_id

name
full_name
description

language
is_fork

github_url

github_created_at

created_at
updated_at
```

The database should not store the entire repository codebase.

GitHub remains the source of truth for:

- Repository files
- README
- File tree
- Branches
- Code
- Detailed repository information
- Commit history

When a user opens a repository, fetch the required GitHub data.

### Activities

An `activities` table is required because this is the bridge between GitHub activity and Pushr's scoring/notification system.

Conceptually:

```text
activities

id

user_id
type
repository_id

github_event_id

metadata

points_awarded

created_at
```

The exact schema may evolve.

`type` identifies the kind of GitHub activity.

Potential activity types include:

```text
PUSH
STAR
FORK
CREATE_REPO
PR
MERGE
ISSUE
```

Only include activity types actually supported/needed by the MVP.

## Repository UI

The repository tab should show a list of repositories.

Each repository should have a Git-history graph underneath its name.

The graph should resemble a Git commit/branch graph, not a statistical chart.

Example concept:

```text
repository-name

●────●────●────────●
     │             │
     ●────●────●───┘
```

Use a community Git graph component/library instead of implementing the graph renderer from scratch.

The backend should transform GitHub commit/branch data into the format required by that component.

When a repository is clicked, the user should be able to see GitHub-like repository information including:

- Code/file tree
- README
- Repository metadata
- Commit history/graph
- Other useful repository information available through GitHub

Do not create a separate commits table merely for rendering the repository graph in V1.

Fetch commit history from GitHub when needed.

## Activity Ownership

Every activity belongs to a Pushr user through `user_id`.

Example:

```text
users

u1 -> arpit
u2 -> deepanshu
```

Activities:

```text
activity 1 -> user_id = u1 -> Arpit
activity 2 -> user_id = u2 -> Deepanshu
```

The background job already knows which GitHub user it is fetching activity for, so it can assign the correct `user_id`.

The activity query can therefore be scoped by:

```text
user_id
+
type
+
activity-specific identifier
```

## Activity Deduplication

The system must prevent the same GitHub action from being processed twice.

If multiple APIs/sources are ever used, do not assume their event IDs are identical.

Different concepts:

```text
Git commit SHA
GitHub Events API event ID
Webhook delivery ID
```

A commit SHA identifies the actual Git commit.

An event ID identifies an API event.

A webhook delivery ID identifies a webhook delivery.

For V1, if only the Events API is used, the implementation can use the Events API event ID as the primary deduplication identifier.

If multiple sources are introduced later, design source-specific deduplication carefully.

Use `user_id` to scope activity lookups.

## Notifications

The product should notify the user's bro when meaningful GitHub activity occurs.

Example:

```text
Your bro is cooking.

Arpit just pushed 5 commits to github-rival.
```

Browser push notifications are preferred for V1.

An in-app `notifications` table may be added if notification history/read/unread state is required.

Do not introduce unnecessary notification infrastructure until the UX requires it.

## Personal Stats

Personal stats are separate conceptually from rivalry scores.

Personal stats describe the user's overall Pushr/GitHub activity.

Rivalry scores describe performance inside one specific 6-month rivalry.

Example:

```text
PERSONAL

Total commits: 1,247
Current streak: 12
Longest streak: 31
```

versus:

```text
RIVALRY

Arpit: 12,480
Deepanshu: 11,980
Rivalry score: 24,460
```

Do not introduce a separate ranking tier system.

## Scoring

The scoring algorithm has not been finalized yet.

Do not hard-code assumptions about how many points each GitHub action receives.

The system should be designed so scoring rules can be changed without restructuring the database.

Important:

```text
GitHub Activity
      ↓
Determine points
      ↓
Update user's personal derived stats if applicable
      ↓
Update rivalry participant's score
      ↓
Update rivalry_score
      ↓
Create notification
```

Avoid allowing trivial activity to be exploited for excessive points.

## Design Principles

1. Keep V1 lightweight.
2. GitHub remains the source of truth for GitHub-specific data.
3. PostgreSQL stores Pushr-specific state and derived data.
4. Do not duplicate the entire GitHub codebase/history unnecessarily.
5. Activities are the central event layer connecting GitHub activity, scoring, and notifications.
6. Preserve rivalry history after a 6-month match ends.
7. Avoid artificial developer rankings.
8. Prioritize the "Grow with your BRO" experience over unnecessary gamification.
9. Avoid premature optimization and unnecessary infrastructure.
10. Keep the architecture extensible enough to add GitHub webhooks later.

## Product Identity

Project name:

**Pushr**

Core USP:

> Grow with your BRO.

Possible supporting messaging:

> Build. Push. Grow.

or

> Your progress pushes theirs.

The product should feel competitive, motivating, and developer-focused, but not like a generic leaderboard application.
