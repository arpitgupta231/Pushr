"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, Flame } from "lucide-react";
import { ActivityHeatmap } from "@/components/ui/activity-heatmap";
import { cn } from "@/lib/utils";

/*
 * RivalClient — full-screen rivalry view for an ACTIVE rivalry.
 *
 * Props:
 *   rivalry:     the `/api/rivalry/active` payload:
 *                { id, status, user1_score, user2_score, rivalry_score,
 *                  started_at, ends_at, user1_username, user2_username,
 *                  user1: { username, total_commits, current_streak,
 *                    longest_streak, following_count, starred_repo_count,
 *                    contributions: { days, total, year },
 *                    featured_repo: { name, full_name, language, github_url,
 *                      activity_count, last_activity_at } | null },
 *                  user2: { ... } }
 *   youUsername: viewer's GitHub login — shows the YOU badge. Optional.
 *
 * Concept: fight card. Scoreboard hero with giant face-off numerals, a
 * tale-of-the-tape comparison table, then one dossier panel per user with
 * heatmap + most-active-repo spotlight.
 *
 * Sides: the viewer always renders on the LEFT, the rival on the right.
 * Tones: green = you, soft red = the enemy (zinc fallback if viewer unknown).
 *
 * TODOs:
 *   - swap letter medallions for real avatars (the API returns no avatar_urls yet)
 *   - per-activity/scoring breakdown (needs an activities-by-rivalry read)
 */

const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
};

const TONE = {
  green: {
    panel: "border-green-500/25",
    accentBar: "bg-gradient-to-r from-green-500/70 to-green-500/0",
    medallion: "bg-green-500/20 text-green-300",
    ring: "ring-1 ring-green-500/40",
    text: "text-green-300",
  },
  red: {
    panel: "border-red-400/20",
    accentBar: "bg-gradient-to-r from-red-400/60 to-red-400/0",
    medallion: "bg-red-400/15 text-red-300",
    ring: "ring-1 ring-red-400/40",
    text: "text-red-300",
  },
  zinc: {
    panel: "border-white/10",
    accentBar: "bg-gradient-to-r from-zinc-600/70 to-zinc-600/0",
    medallion: "bg-zinc-800 text-zinc-300",
    ring: "ring-1 ring-white/15",
    text: "text-zinc-500",
  },
};

// Flat hexes for the merged duel-bar gradient (Tailwind classes can't paint a
// mid-bar blend, so the stops go inline).
const TONE_HEX = {
  green: "#4ade80",
  red: "#f87171",
  zinc: "#52525b",
};

function formatScore(n) {
  return (Number(n) || 0).toLocaleString("en-US");
}

function daysLeft(endsAt) {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
}

function timeAgo(iso) {
  if (!iso) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function ProfileLink({ username, className }) {
  return (
    <a
      href={`https://github.com/${username}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open @${username} on GitHub`}
      className={cn(
        "group/link flex min-w-0 items-center gap-1 font-mono text-sm transition-colors hover:text-white hover:underline hover:decoration-white/40 hover:underline-offset-4",
        className
      )}
    >
      <span className="min-w-0 truncate">@{username}</span>
      <ExternalLink
        className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-70"
        aria-hidden="true"
      />
    </a>
  );
}

const ANGLED = "[clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,0_100%)]";

function UserAvatar({ username, avatarUrl, size = 40, tone = "zinc", textClass = "text-base", angled = false }) {
  const [failed, setFailed] = useState(false);
  const t = TONE[tone] ?? TONE.zinc;
  const box = { width: size, height: size };
  if (!avatarUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn("flex shrink-0 items-center justify-center font-bold", angled ? ANGLED : "rounded-full", textClass, t.medallion)}
        style={box}
      >
        {username.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={avatarUrl}
      alt={`@${username}'s GitHub avatar`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-cover", angled ? ANGLED : "rounded-full", t.ring)}
      style={box}
    />
  );
}

function StreakBadge({ count, hot }) {
  return (
    <span
      title={`Current streak: ${count} days`}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs tabular-nums",
        hot ? "border-orange-400/30 bg-orange-400/10 text-orange-400" : "border-white/10 bg-black/40 text-zinc-500"
      )}
    >
      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{count}d</span>
      <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden="true" fill="none">
        {count > 0 ? (
          <path
            d="M1 13 C 8 13 9 11 11 7 C 13 3.5 15 3 27 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M1 13 H27"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="3 3"
          />
        )}
      </svg>
    </span>
  );
}

function FeaturedRepo({ repo }) {
  if (!repo) {
    return (
      <div className="mt-2 flex items-center justify-center rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-sm text-zinc-500">
        No tracked activity yet — push something to light this up.
      </div>
    );
  }
  const ago = timeAgo(repo.last_activity_at);
  return (
    <a
      href={repo.github_url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${repo.full_name} on GitHub`}
      className="group/repo mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 transition-colors hover:border-white/25"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: LANGUAGE_COLORS[repo.language] ?? "#52525b" }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-sm text-zinc-100">{repo.full_name}</span>
        <span className="truncate text-xs text-zinc-500">
          {[repo.language, `${repo.activity_count} ${repo.activity_count === 1 ? "activity" : "activities"} this rivalry`, ago ? `last ${ago}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <ExternalLink
        className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover/repo:text-zinc-200"
        aria-hidden="true"
      />
    </a>
  );
}

function TapeRow({ label, a, b, aTone, bTone, suffix }) {
  const win = a === b ? 0 : a > b ? 1 : 2;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-baseline border-t border-white/5 py-2.5">
      <span className={cn("font-mono text-lg tabular-nums", win === 1 ? aTone.text : win === 0 ? "text-zinc-300" : "text-zinc-600")}>
        {formatScore(a)}
        {suffix && <span className="ml-0.5 text-xs">{suffix}</span>}
      </span>
      <span className="px-3 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</span>
      <span className={cn("text-right font-mono text-lg tabular-nums", win === 2 ? bTone.text : win === 0 ? "text-zinc-300" : "text-zinc-600")}>
        {formatScore(b)}
        {suffix && <span className="ml-0.5 text-xs">{suffix}</span>}
      </span>
    </div>
  );
}

function UserPanel({ view, score, isYou, tone }) {
  const t = TONE[tone] ?? TONE.zinc;
  const username = view?.username ?? "unknown";
  const days = view?.contributions?.days ?? [];
  const year = view?.contributions?.year ?? new Date().getFullYear();
  const total = view?.contributions?.total ?? 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-zinc-950/70 p-4 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-5",
        t.panel
      )}
    >
      <div className={cn("h-1 rounded-full", t.accentBar)} aria-hidden="true" />
      {/* Identity */}
      <div className="mt-3 flex items-center gap-3">
        <UserAvatar
          username={username}
          avatarUrl={view?.avatar_url}
          size={48}
          tone={tone}
          textClass="text-lg"
          angled
        />
        <span className="flex min-w-0 flex-col gap-1">
          <ProfileLink username={username} className="text-base text-zinc-100" />
          <span className="flex flex-wrap items-center gap-1.5">
            {isYou && (
              <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-black">
                YOU
              </span>
            )}
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {formatScore(score)} pts
            </span>
          </span>
        </span>
      </div>

      {/* Heatmap */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-2">
        <ActivityHeatmap days={days} total={total} year={year} />
      </div>

      {/* Most active repo */}
      <div className="mt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Most active repo · this rivalry
        </p>
        <FeaturedRepo repo={view?.featured_repo ?? null} />
      </div>
    </div>
  );
}

export default function RivalClient({ rivalry, youUsername = null }) {
  if (!rivalry) return null;

  const u1 = rivalry.user1_username;
  const u2 = rivalry.user2_username;
  const s1 = Number(rivalry.user1_score) || 0;
  const s2 = Number(rivalry.user2_score) || 0;
  const total = Number(rivalry.rivalry_score) || s1 + s2;
  const share1 = total > 0 ? (s1 / total) * 100 : 50;
  const leader = s1 === s2 ? 0 : s1 > s2 ? 1 : 2;
  const youSide = youUsername === u1 ? 1 : youUsername === u2 ? 2 : null;
  const toneOf = (side) => {
    if (youSide === null) return side === leader ? "green" : "zinc";
    return side === youSide ? "green" : "red";
  };

  // Viewer on the left, rival on the right — regardless of user1/user2 order.
  const sides = [
    { side: 1, username: u1, score: s1, share: share1, view: rivalry.user1 },
    { side: 2, username: u2, score: s2, share: 100 - share1, view: rivalry.user2 },
  ];
  const [L, R] = youSide === 2 ? [sides[1], sides[0]] : [sides[0], sides[1]];
  const streakL = Number(L.view?.current_streak) || 0;
  const streakR = Number(R.view?.current_streak) || 0;
  const streakWin = streakL === streakR ? 0 : streakL > streakR ? 1 : 2;
  const year = L.view?.contributions?.year ?? new Date().getFullYear();

  const tapeRows = [
    { label: "Rivalry score", a: L.score, b: R.score },
    { label: "Total commits", a: Number(L.view?.total_commits) || 0, b: Number(R.view?.total_commits) || 0 },
    { label: "Best streak", a: Number(L.view?.longest_streak) || 0, b: Number(R.view?.longest_streak) || 0, suffix: "d" },
    { label: `Contributions ${year}`, a: Number(L.view?.contributions?.total) || 0, b: Number(R.view?.contributions?.total) || 0 },
  ];

  const left = daysLeft(rivalry.ends_at);
  const endsLabel = rivalry.ends_at
    ? new Date(rivalry.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const shortId = String(rivalry.id ?? "").slice(0, 8).toUpperCase();

  return (
    <section aria-label="Rivalry stats" className="flex w-full flex-col gap-4">
      {/* Scoreboard hero */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 shadow-2xl shadow-black/40 backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500 sm:px-5">
          <span>Rivalry #{shortId}</span>
          <span>{left !== null ? `${left}d left · ends ${endsLabel}` : "No end date"}</span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-6 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <ProfileLink username={L.username} className="text-base text-zinc-200 sm:text-lg" />
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className={cn("font-mono text-5xl font-bold tabular-nums sm:text-6xl lg:text-7xl", TONE[toneOf(L.side)].text)}>
                {formatScore(L.score)}
              </span>
              <StreakBadge count={streakL} hot={streakWin === 1} />
            </span>
          </div>
          <div className="flex flex-col items-center gap-2 px-1">
            <span className="flex h-10 w-10 rotate-45 items-center justify-center border border-white/15 bg-zinc-900" aria-hidden="true">
              <span className="-rotate-45 font-mono text-[10px] font-bold tracking-widest text-zinc-300">VS</span>
            </span>
            <p className="font-mono text-xl font-bold tabular-nums text-white sm:text-2xl">{formatScore(total)}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">rivalry score</p>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-1.5 text-right">
            <ProfileLink username={R.username} className="max-w-full justify-end text-base text-zinc-200 sm:text-lg" />
            <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              <StreakBadge count={streakR} hot={streakWin === 2} />
              <span className={cn("font-mono text-5xl font-bold tabular-nums sm:text-6xl lg:text-7xl", TONE[toneOf(R.side)].text)}>
                {formatScore(R.score)}
              </span>
            </span>
          </div>
        </div>

        <div className="px-4 pb-1 sm:px-6">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(to right, ${TONE_HEX[toneOf(L.side)]} 0%, ${TONE_HEX[toneOf(L.side)]} ${Math.max(L.share - 8, 0)}%, ${TONE_HEX[toneOf(R.side)]} ${Math.min(L.share + 8, 100)}%, ${TONE_HEX[toneOf(R.side)]} 100%)`,
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-zinc-500">
            <span className="truncate">
              @{L.username} · {L.share.toFixed(0)}%
            </span>
            <span className="truncate">
              {R.share.toFixed(0)}% · @{R.username}
            </span>
          </div>
        </div>

        {/* Tale of the tape */}
        <div className="mt-3 border-t border-white/5 px-4 pb-2 sm:px-6">
          <p className="pt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Tale of the tape</p>
          {tapeRows.map((row) => (
            <TapeRow
              key={row.label}
              label={row.label}
              a={row.a}
              b={row.b}
              aTone={TONE[toneOf(L.side)]}
              bTone={TONE[toneOf(R.side)]}
              suffix={row.suffix}
            />
          ))}
        </div>
      </div>

      {/* Dossiers */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <UserPanel view={L.view} score={L.score} isYou={L.side === youSide} tone={toneOf(L.side)} />
        <UserPanel view={R.view} score={R.score} isYou={R.side === youSide} tone={toneOf(R.side)} />
      </div>
    </section>
  );
}
