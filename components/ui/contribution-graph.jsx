"use client";

import * as React from "react";
import { cn } from "cn";

// Number of week columns to render (trailing ~4 months).
const DEFAULT_WEEKS = 17;

// GitHub dark-mode contribution palette: empty + 4 intensity levels.
const LEVELS = [
  "bg-[#161b22]",
  "bg-[#0e4429]",
  "bg-[#006d32]",
  "bg-[#26a641]",
  "bg-[#39d353]",
];

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function formatDay(date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildColumns(commits, weeks) {
  const counts = new Map();
  let latest = null;
  for (const c of commits) {
    if (!c?.date) continue;
    counts.set(c.date, (counts.get(c.date) ?? 0) + 1);
    if (!latest || c.date > latest) latest = c.date;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let end = today;
  if (latest) {
    const [y, m, d] = latest.split("-").map(Number);
    const latestDate = new Date(y, m - 1, d);
    if (latestDate > end) end = latestDate;
  }

  // Last column ends on the Saturday of the end week; grid starts back `weeks` Sundays.
  const endSaturday = new Date(end);
  endSaturday.setDate(endSaturday.getDate() + (6 - endSaturday.getDay()));
  const start = new Date(endSaturday);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const max = counts.size === 0 ? 0 : Math.max(...counts.values());

  const columns = [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const key = toKey(cursor);
      const count = counts.get(key) ?? 0;
      const level =
        count === 0 || max === 0
          ? 0
          : Math.min(4, Math.ceil((count / max) * 4));
      days.push({ date: new Date(cursor), count, level });
      cursor.setDate(cursor.getDate() + 1);
    }
    columns.push(days);
  }

  // Month label on a column when its Sunday starts a different month than the previous column's.
  const monthLabels = columns.map((days, i) => {
    if (i === 0) return MONTH_NAMES[days[0].date.getMonth()];
    const prev = columns[i - 1][0].date.getMonth();
    const cur = days[0].date.getMonth();
    return cur !== prev ? MONTH_NAMES[cur] : "";
  });

  return { columns, monthLabels };
}

export function ContributionGraph({
  commits = [],
  weeks = DEFAULT_WEEKS,
  className,
  ...props
}) {
  const { columns, monthLabels } = React.useMemo(
    () => buildColumns(commits, weeks),
    [commits, weeks]
  );

  return (
    <div className={cn("w-full bg-black", className)} {...props}>
      <div className="w-full">
        <div className="w-full p-2  ">
          <div className="mb-2 flex" style={{ gap: 3 }} aria-hidden="true">
            {monthLabels.map((label, i) => (
              <span
                key={i}
                className="flex-1 overflow-visible whitespace-nowrap text-[11px] leading-none text-zinc-500"
              >
                {label}
              </span>
            ))}
          </div>

          <div
            role="img"
            aria-label="Commit activity heatmap"
            className="flex w-full"
            style={{ gap: 3 }}
          >
            {columns.map((days, wi) => (
              <div key={wi} className="flex flex-1 flex-col" style={{ gap: 3 }}>
                {days.map((day, di) => (
                  <div key={`${wi}-${di}`} className="group relative w-full">
                    <div
                      className={cn(
                        "h-[17px] w-full rounded-[3px]",
                        LEVELS[day.level]
                      )}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 shadow-xl shadow-black/40 group-hover:block">
                      {day.count === 0
                        ? `No commits on ${formatDay(day.date)}`
                        : `${day.count} commit${day.count === 1 ? "" : "s"} on ${formatDay(day.date)}`}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
