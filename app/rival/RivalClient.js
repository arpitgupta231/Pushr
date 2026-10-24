"use client";

import { useState } from "react";
import Image from "next/image";
import { Clock, ExternalLink, Flame } from "lucide-react";
import { ActivityHeatmap } from "@/components/ui/activity-heatmap";
import { cn } from "@/lib/utils";

/*
 * RivalClient — Minimalist Modern Glass rivalry view for an ACTIVE rivalry.
 *
 * Preserves all stats parameters:
 *   - rivalry.id, started_at, ends_at, scores & shares
 *   - L & R user views: current_streak, longest_streak, total_commits,
 *     contributions calendar (days, total, year), and featured_repo
 *   - Head-to-head "Tale of the Tape" metrics
 *
 * Sides: Viewer on the LEFT (emerald/green), rival on the RIGHT (rose/red).
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
    panel: "border-emerald-500/20 hover:border-emerald-500/35",
    accentGradient: "from-emerald-500/60 via-emerald-500/20 to-transparent",
    medallion: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    ring: "ring-1 ring-emerald-500/40 ring-offset-2 ring-offset-zinc-950",
    text: "text-emerald-400",
    glow: "drop-shadow-[0_2px_14px_rgba(52,211,153,0.22)]",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    pill: "bg-emerald-500",
  },
  red: {
    panel: "border-rose-500/20 hover:border-rose-500/35",
    accentGradient: "from-rose-500/60 via-rose-500/20 to-transparent",
    medallion: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
    ring: "ring-1 ring-rose-500/40 ring-offset-2 ring-offset-zinc-950",
    text: "text-rose-400",
    glow: "drop-shadow-[0_2px_14px_rgba(251,113,133,0.22)]",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    pill: "bg-rose-500",
  },
  zinc: {
    panel: "border-white/10 hover:border-white/20",
    accentGradient: "from-zinc-500/40 via-zinc-500/10 to-transparent",
    medallion: "bg-zinc-800/80 text-zinc-300 border border-white/10",
    ring: "ring-1 ring-white/15 ring-offset-2 ring-offset-zinc-950",
    text: "text-zinc-400",
    glow: "",
    badge: "border-white/10 bg-white/5 text-zinc-400",
    pill: "bg-zinc-500",
  },
};

const TONE_HEX = {
  green: "#10b981",
  red: "#f43f5e",
  zinc: "#71717a",
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
        "group/link inline-flex min-w-0 items-center gap-1.5 font-mono text-sm transition-colors hover:text-white",
        className
      )}
    >
      <span className="min-w-0 truncate">@{username}</span>
      <ExternalLink
        className="h-3 w-3 shrink-0 text-zinc-500 opacity-60 transition-all group-hover/link:translate-x-0.5 group-hover/link:opacity-100 group-hover/link:text-white"
        aria-hidden="true"
      />
    </a>
  );
}

function UserAvatar({ username, avatarUrl, size = 48, tone = "zinc", textClass = "text-base" }) {
  const [failed, setFailed] = useState(false);
  const t = TONE[tone] ?? TONE.zinc;
  const box = { width: size, height: size };

  if (!avatarUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl font-mono font-bold tracking-tight shadow-md backdrop-blur-md",
          textClass,
          t.medallion
        )}
        style={box}
      >
        {username.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={avatarUrl}
      alt={`@${username}'s avatar`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-xl object-cover shadow-md transition-transform duration-300 hover:scale-105", t.ring)}
      style={box}
    />
  );
}

function StreakBadge({ count, hot }) {
  return (
    <span
      title={`Current streak: ${count} days`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs tabular-nums backdrop-blur-md transition-colors",
        hot
          ? "border-amber-400/30 bg-amber-400/10 text-amber-400 shadow-[0_0_12px_-2px_rgba(251,191,36,0.2)]"
          : "border-white/[0.08] bg-zinc-900/60 text-zinc-400"
      )}
    >
      <Flame className={cn("h-3.5 w-3.5", hot ? "fill-amber-400/30 text-amber-400" : "text-zinc-500")} aria-hidden="true" />
      <span className="font-semibold">{count}d</span>
      <svg viewBox="0 0 28 16" className="h-3.5 w-6 opacity-75" aria-hidden="true" fill="none">
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
      <div className="mt-2.5 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-900/30 px-3 py-5 text-center text-xs font-mono text-zinc-500">
        No tracked activity yet — push code to light this up.
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
      className="group/repo mt-2.5 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-zinc-900/70 hover:shadow-lg"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
        style={{
          backgroundColor: LANGUAGE_COLORS[repo.language] ?? "#52525b",
          boxShadow: `0 0 8px ${LANGUAGE_COLORS[repo.language] ?? "#52525b"}66`,
        }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-mono text-xs font-semibold text-zinc-100 group-hover/repo:text-white">
          {repo.full_name}
        </span>
        <span className="truncate font-mono text-[11px] text-zinc-400">
          {[
            repo.language,
            `${repo.activity_count} ${repo.activity_count === 1 ? "activity" : "activities"}`,
            ago ? `last ${ago}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <ExternalLink
        className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-all duration-200 group-hover/repo:translate-x-0.5 group-hover/repo:text-zinc-200"
        aria-hidden="true"
      />
    </a>
  );
}

function TapeRow({ label, a, b, aTone, bTone, suffix }) {
  const win = a === b ? 0 : a > b ? 1 : 2;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
      {/* Left side */}
      <div className="flex items-center gap-2">
        {win === 1 && (
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 shadow-sm", aTone.pill)} aria-hidden="true" />
        )}
        <span
          className={cn(
            "font-mono text-base sm:text-lg tabular-nums tracking-tight",
            win === 1 ? cn("font-semibold", aTone.text) : win === 0 ? "text-zinc-300 font-medium" : "text-zinc-500 font-normal"
          )}
        >
          {formatScore(a)}
          {suffix && <span className="ml-0.5 text-xs font-normal text-zinc-500">{suffix}</span>}
        </span>
      </div>

      {/* Center label */}
      <span className="px-4 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
        {label}
      </span>

      {/* Right side */}
      <div className="flex items-center justify-end gap-2">
        <span
          className={cn(
            "text-right font-mono text-base sm:text-lg tabular-nums tracking-tight",
            win === 2 ? cn("font-semibold", bTone.text) : win === 0 ? "text-zinc-300 font-medium" : "text-zinc-500 font-normal"
          )}
        >
          {formatScore(b)}
          {suffix && <span className="ml-0.5 text-xs font-normal text-zinc-500">{suffix}</span>}
        </span>
        {win === 2 && (
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 shadow-sm", bTone.pill)} aria-hidden="true" />
        )}
      </div>
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
        "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-zinc-950/60 p-5 shadow-2xl backdrop-blur-2xl transition-all duration-300",
        t.panel
      )}
    >
      {/* Top ambient highlight gradient */}
      <div className={cn("absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r", t.accentGradient)} aria-hidden="true" />

      {/* User identity & stats header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar
            username={username}
            avatarUrl={view?.avatar_url}
            size={48}
            tone={tone}
            textClass="text-lg"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <ProfileLink username={username} className="text-base font-semibold text-zinc-100" />
              {isYou && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                  YOU
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
              <span className={cn("font-medium", t.text)}>{formatScore(score)} pts</span>
              <span>·</span>
              <span>{view?.current_streak ?? 0}d streak</span>
            </div>
          </div>
        </div>

        <StreakBadge count={Number(view?.current_streak) || 0} hot={(Number(view?.current_streak) || 0) > 0} />
      </div>

      {/* Heatmap tray */}
      <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/40 p-3 shadow-inner">
        <div className="mb-2 flex items-center justify-between px-1 font-mono text-[11px] text-zinc-400">
          <span className="uppercase tracking-wider">Contributions · {year}</span>
          <span className="text-zinc-300">{formatScore(total)} total</span>
        </div>
        <ActivityHeatmap days={days} total={total} year={year} />
      </div>

      {/* Most active repo */}
      <div className="mt-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
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

  // Preserved stats parameters
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
    <section aria-label="Rivalry stats" className="flex w-full flex-col gap-5">
      {/* Scoreboard hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/70 shadow-2xl backdrop-blur-2xl">
        {/* Subtle top edge glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden="true" />

        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3 font-mono text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-semibold uppercase tracking-widest text-zinc-300">Rivalry #{shortId}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-zinc-400">
            <Clock className="h-3 w-3 text-zinc-400" aria-hidden="true" />
            <span>{left !== null ? `${left}d remaining · Ends ${endsLabel}` : "Ongoing match"}</span>
          </div>
        </div>

        {/* Duel numbers hero */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-8 sm:px-8">
          {/* Left contestant (You) */}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <ProfileLink username={L.username} className="text-base font-semibold text-zinc-200 sm:text-lg" />
              {youSide === L.side && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                  YOU
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span
                className={cn(
                  "font-mono text-5xl font-extrabold tracking-tight tabular-nums sm:text-6xl lg:text-7xl",
                  TONE[toneOf(L.side)].text,
                  TONE[toneOf(L.side)].glow
                )}
              >
                {formatScore(L.score)}
              </span>
              <StreakBadge count={streakL} hot={streakWin === 1} />
            </div>
          </div>

          {/* VS Center badge & total */}
          <div className="flex flex-col items-center justify-center gap-1.5 px-2">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-zinc-900/90 shadow-xl backdrop-blur-md">
              <span className="font-mono text-xs font-bold tracking-widest text-zinc-200">VS</span>
            </div>
            <div className="mt-1 flex flex-col items-center">
              <p className="font-mono text-xl font-bold tracking-tight tabular-nums text-white sm:text-2xl">
                {formatScore(total)}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-400">
                Rivalry score
              </p>
            </div>
          </div>

          {/* Right contestant (Rival) */}
          <div className="flex min-w-0 flex-col items-end gap-2 text-right">
            <div className="flex items-center justify-end gap-2">
              {youSide === R.side && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                  YOU
                </span>
              )}
              <ProfileLink username={R.username} className="max-w-full justify-end text-base font-semibold text-zinc-200 sm:text-lg" />
            </div>
            <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-2">
              <StreakBadge count={streakR} hot={streakWin === 2} />
              <span
                className={cn(
                  "font-mono text-5xl font-extrabold tracking-tight tabular-nums sm:text-6xl lg:text-7xl",
                  TONE[toneOf(R.side)].text,
                  TONE[toneOf(R.side)].glow
                )}
              >
                {formatScore(R.score)}
              </span>
            </div>
          </div>
        </div>

        {/* Duel progress bar */}
        <div className="px-5 pb-3 sm:px-8">
          <div className="h-2 w-full overflow-hidden rounded-full border border-white/[0.06] bg-zinc-900/80 p-[1px]">
            <div
              className="h-full w-full rounded-full transition-all duration-700"
              style={{
                background: `linear-gradient(to right, ${TONE_HEX[toneOf(L.side)]} 0%, ${TONE_HEX[toneOf(L.side)]} ${Math.max(L.share - 6, 0)}%, ${TONE_HEX[toneOf(R.side)]} ${Math.min(L.share + 6, 100)}%, ${TONE_HEX[toneOf(R.side)]} 100%)`,
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-xs text-zinc-400">
            <span className="truncate font-medium text-zinc-300">
              @{L.username} · {L.share.toFixed(0)}%
            </span>
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">
              {formatScore(L.score)} : {formatScore(R.score)}
            </span>
            <span className="truncate font-medium text-zinc-300">
              {R.share.toFixed(0)}% · @{R.username}
            </span>
          </div>
        </div>

        {/* Tale of the Tape */}
        <div className="mt-2 border-t border-white/[0.06] px-5 py-4 sm:px-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400">
              Tale of the tape
            </p>
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Head-to-head metrics
            </span>
          </div>
          <div className="divide-y divide-white/[0.04]">
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
      </div>

      {/* User Dossiers */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <UserPanel view={L.view} score={L.score} isYou={L.side === youSide} tone={toneOf(L.side)} />
        <UserPanel view={R.view} score={R.score} isYou={R.side === youSide} tone={toneOf(R.side)} />
      </div>
    </section>
  );
}
