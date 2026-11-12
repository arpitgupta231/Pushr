"use client";

import * as React from "react";
import { GitCommit, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  aggregateQuarterCommits,
  formatUtcDay,
  MONTH_NAMES,
  QUARTERS,
} from "@/lib/repo-insights";

// Liquid glass aesthetic level colors with subtle green glow
const LEVELS = [
  "bg-white/[0.04] border border-white/[0.04]",
  "bg-green-950/90 border border-green-800/40 shadow-[0_0_6px_rgba(5,46,22,0.35)]",
  "bg-green-800/80 border border-green-600/50 shadow-[0_0_8px_rgba(22,163,74,0.25)]",
  "bg-green-600 border border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]",
  "bg-green-500 border border-green-400 shadow-[0_0_14px_rgba(34,197,94,0.45)]",
];

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function keyToDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fallbackQuarter(quarter, index) {
  return {
    ...quarter,
    key: quarter.key ?? `Q${index + 1}`,
    label: quarter.label ?? `Q${index + 1}`,
    count: quarter.count ?? 0,
  };
}

function buildQuarterGrid(days, year, quarter) {
  const counts = new Map();
  const levels = new Map();
  for (const day of days) {
    if (!day?.date) continue;
    counts.set(day.date, day.count ?? 0);
    levels.set(day.date, day.level ?? 0);
  }

  const quarterStart = new Date(Date.UTC(year, quarter.startMonth, 1));
  const quarterEnd = new Date(Date.UTC(year, quarter.endMonth + 1, 0));

  const gridStart = new Date(quarterStart);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const gridEnd = new Date(quarterEnd);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  const columns = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      const dateKey = toKey(cursor);
      const inQuarter = cursor >= quarterStart && cursor <= quarterEnd;
      week.push({
        date: dateKey,
        count: inQuarter ? counts.get(dateKey) ?? 0 : 0,
        level: inQuarter ? levels.get(dateKey) ?? 0 : 0,
        inQuarter,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    columns.push(week);
  }

  const columnMonths = columns.map((week) => {
    const firstInQuarter = week.find((day) => day.inQuarter);
    return firstInQuarter ? keyToDate(firstInQuarter.date).getUTCMonth() : null;
  });

  const monthLabels = columns.map((_, index) => {
    const month = columnMonths[index];
    if (month === null) return "";
    if (index === 0) return MONTH_NAMES[month];
    return month !== columnMonths[index - 1] ? MONTH_NAMES[month] : "";
  });

  return { columns, monthLabels };
}

export function RepoCommitHeatmap({
  commits = [],
  data = null,
  insights = null,
  year,
  initialQuarter,
  className,
  ...props
}) {
  const containerRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  const provided = data ?? insights;
  const resolved = React.useMemo(
    () => provided ?? aggregateQuarterCommits(commits, year),
    [provided, commits, year]
  );

  const resolvedYear = resolved?.year ?? year ?? new Date().getFullYear();

  const quarters = React.useMemo(() => {
    if (Array.isArray(resolved?.quarters) && resolved.quarters.length === 4) {
      return resolved.quarters.map(fallbackQuarter);
    }
    return QUARTERS.map(fallbackQuarter);
  }, [resolved]);

  const defaultQuarter = React.useMemo(() => {
    if (Number.isInteger(initialQuarter) && initialQuarter >= 0 && initialQuarter <= 3) {
      return initialQuarter;
    }
    if (resolvedYear === new Date().getFullYear()) {
      return Math.floor(new Date().getMonth() / 3);
    }
    let bestIndex = -1;
    let bestCount = 0;
    quarters.forEach((quarter, index) => {
      if (quarter.count > bestCount) {
        bestCount = quarter.count;
        bestIndex = index;
      }
    });
    return bestIndex >= 0 ? bestIndex : 3;
  }, [initialQuarter, resolvedYear, quarters]);

  const [activeQuarter, setActiveQuarter] = React.useState(defaultQuarter);
  const activeIndex = Math.min(Math.max(activeQuarter, 0), quarters.length - 1);
  const active = quarters[activeIndex];

  const { columns, monthLabels } = React.useMemo(
    () => buildQuarterGrid(resolved?.days ?? [], resolvedYear, active),
    [resolved, resolvedYear, active]
  );

  const activeCount = active?.count ?? 0;
  const yearTotal =
    resolved?.totalCommitsInYear ??
    resolved?.totalCommitsYear ??
    quarters.reduce((total, quarter) => total + quarter.count, 0);

  const commitsByDate = resolved?.commitsByDate || {};

  // Tooltip positioning state
  const [tooltipState, setTooltipState] = React.useState(null);

  const handleCellHover = (day, e) => {
    if (!day.inQuarter) {
      setTooltipState(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const cellRect = e.currentTarget.getBoundingClientRect();

    const rawX = cellRect.left - containerRect.left + cellRect.width / 2;
    const rawY = cellRect.top - containerRect.top;

    // Check boundary
    const isCloseToTop = rawY < 140;
    const containerWidth = containerRect.width;
    const tooltipWidth = 260;
    const halfWidth = tooltipWidth / 2;
    const clampedX = Math.max(halfWidth + 12, Math.min(rawX, containerWidth - halfWidth - 12));

    const dayCommits = commitsByDate[day.date] || [];

    setTooltipState({
      day,
      x: clampedX,
      y: isCloseToTop ? rawY + cellRect.height + 8 : rawY - 8,
      position: isCloseToTop ? "bottom" : "top",
      commits: dayCommits,
    });
  };

  const handleCellLeave = () => {
    setTooltipState(null);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-5 sm:p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all duration-300",
        className
      )}
      {...props}
    >
      {/* Liquid glass light sheen header */}
      <div className="mb-5 flex flex-col gap-3.5 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/25 text-green-500 shadow-[0_0_12px_rgba(22,163,74,0.18)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
              <span>Commit Activity</span>
              <span className="text-xs font-normal text-zinc-400">({resolvedYear})</span>
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              <span className="font-semibold text-green-500">{activeCount}</span> commit
              {activeCount === 1 ? "" : "s"} in {active?.label} ({active?.name})
            </p>
          </div>
        </div>

        {/* Liquid Glass Quarter Switcher */}
        <div
          role="tablist"
          aria-label="Select quarter"
          className="inline-flex shrink-0 rounded-xl border border-white/[0.1] bg-white/[0.04] p-1 text-xs backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
        >
          {quarters.map((quarter, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={quarter.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveQuarter(index);
                  setTooltipState(null);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-green-600 to-green-500 font-semibold text-zinc-950 shadow-[0_0_16px_rgba(22,163,74,0.3)]"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                )}
              >
                <span>{quarter.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    isActive
                      ? "bg-zinc-950/30 font-bold text-zinc-950"
                      : "bg-white/[0.08] text-zinc-400"
                  )}
                >
                  {quarter.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid container with custom thin scrollbar */}
      <div
        ref={scrollRef}
        onScroll={() => setTooltipState(null)}
        className="overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]"
      >
        <div className="min-w-[620px]">
          <div className="flex gap-2.5">
            <div className="flex shrink-0 flex-col" aria-hidden="true">
              <span className="h-[14px] shrink-0" />
              <div className="flex flex-col" style={{ gap: 3.5 }}>
                {WEEKDAY_LABELS.map((label, index) => (
                  <span
                    key={index}
                    className="flex h-[13px] items-center text-[9px] font-mono leading-none text-zinc-500"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div
                className="mb-1.5 grid"
                style={{
                  gridTemplateColumns: `repeat(${columns.length || 1}, minmax(0, 1fr))`,
                  gap: 3.5,
                }}
                aria-hidden="true"
              >
                {monthLabels.map((label, index) => (
                  <span
                    key={index}
                    className="overflow-visible whitespace-nowrap text-[10px] font-mono text-zinc-400"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div
                role="img"
                aria-label={`Repository commit heatmap for ${active?.label ?? ""} ${resolvedYear}`}
                className="grid w-full"
                style={{
                  gridTemplateColumns: `repeat(${columns.length || 1}, minmax(0, 1fr))`,
                  gap: 3.5,
                }}
              >
                {columns.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col" style={{ gap: 3.5 }}>
                    {week.map((day) => (
                      <div
                        key={day.date}
                        onMouseEnter={(e) => handleCellHover(day, e)}
                        onMouseLeave={handleCellLeave}
                        className="relative w-full cursor-pointer"
                      >
                        <div
                          className={cn(
                            "h-[13px] w-full rounded-[3px] transition-all duration-150 hover:scale-125 hover:z-20 hover:ring-2 hover:ring-white/40",
                            LEVELS[day.level] ?? LEVELS[0],
                            !day.inQuarter && "pointer-events-none opacity-0"
                          )}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-zinc-400">
            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <span>Total commits in {resolvedYear}:</span>
              <span className="font-semibold text-green-500">{yearTotal}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
              <span>Less</span>
              <div className="flex items-center gap-1">
                {LEVELS.map((level, i) => (
                  <span
                    key={i}
                    className={cn("h-[11px] w-[11px] rounded-[2px]", level)}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Liquid Glass Hover Commit History Popup (Never clipped by scroll container) */}
      {tooltipState && (
        <div
          className="pointer-events-none absolute z-50 transition-all duration-150 ease-out"
          style={{
            left: `${tooltipState.x}px`,
            top: `${tooltipState.y}px`,
            transform: tooltipState.position === "bottom" ? "translate(-50%, 0)" : "translate(-50%, -100%)",
          }}
        >
          <div className="w-72 max-w-[90vw] rounded-2xl border border-white/[0.18] bg-zinc-950/90 p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.15)] ring-1 ring-white/10 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-zinc-200">
                <GitCommit className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs font-semibold">
                  {formatUtcDay(tooltipState.day.date)}
                </span>
              </div>
              <span className="rounded-full bg-green-500/15 border border-green-500/40 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                {tooltipState.day.count} {tooltipState.day.count === 1 ? "commit" : "commits"}
              </span>
            </div>

            {/* Commit History List */}
            {tooltipState.commits.length === 0 ? (
              <p className="text-[11px] text-zinc-400 py-1 text-center">
                {tooltipState.day.count > 0
                  ? `${tooltipState.day.count} commit${tooltipState.day.count === 1 ? "" : "s"} recorded`
                  : "No commit activity on this day"}
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-44 overflow-y-auto pr-0.5 [scrollbar-width:none]">
                {tooltipState.commits.slice(0, 4).map((commit, idx) => (
                  <div
                    key={commit.sha || idx}
                    className="flex flex-col gap-1 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                  >
                    <p className="text-xs font-medium text-zinc-100 line-clamp-2 leading-snug">
                      {commit.message}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5 border-t border-white/[0.04]">
                      <span className="truncate max-w-[140px] text-zinc-300 font-medium">
                        @{commit.author}
                      </span>
                      <span className="font-mono text-green-500/90 text-[10px] bg-green-500/10 px-1 rounded border border-green-500/25">
                        {commit.shortSha}
                      </span>
                    </div>
                  </div>
                ))}
                {tooltipState.commits.length > 4 && (
                  <div className="pt-1 text-center text-[10px] font-medium text-green-500">
                    +{tooltipState.commits.length - 4} more commits
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RepoCommitHeatmap;
