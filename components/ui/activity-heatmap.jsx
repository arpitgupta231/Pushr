"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Classic GitHub dark-mode palette: empty + 4 intensity levels.
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

const QUARTERS = [
  { label: "Q1", startMonth: 0, endMonth: 2 },
  { label: "Q2", startMonth: 3, endMonth: 5 },
  { label: "Q3", startMonth: 6, endMonth: 8 },
  { label: "Q4", startMonth: 9, endMonth: 11 },
];

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

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

function currentQuarter() {
  return Math.floor(new Date().getMonth() / 3);
}

function buildQuarterColumns(days, year, quarter, yearMax) {
  const counts = new Map();
  for (const d of days) {
    if (!d?.date) continue;
    counts.set(d.date, (counts.get(d.date) ?? 0) + (d.count ?? 1));
  }

  const q = QUARTERS[quarter];
  const qStart = new Date(year, q.startMonth, 1);
  qStart.setHours(0, 0, 0, 0);
  const qEnd = new Date(year, q.endMonth + 1, 0);
  qEnd.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(qStart);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(qEnd);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const columns = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(cursor);
      const inQuarter = date >= qStart && date <= qEnd;
      const isFuture = date > today;
      const key = toKey(date);
      const count = inQuarter && !isFuture ? (counts.get(key) ?? 0) : 0;
      const level =
        !inQuarter || isFuture || count === 0 || yearMax === 0
          ? 0
          : Math.min(4, Math.ceil((count / yearMax) * 4));
      week.push({ date, count, level, inQuarter, isFuture });
      cursor.setDate(cursor.getDate() + 1);
    }
    columns.push(week);
  }

  // Month label per week column, based on the first in-quarter day it holds.
  const firstInQuarterMonth = columns.map((week) => {
    const found = week.find((d) => d.inQuarter);
    return found ? found.date.getMonth() : null;
  });
  const monthLabels = columns.map((_, i) => {
    const cur = firstInQuarterMonth[i];
    if (cur === null) return "";
    if (i === 0) return MONTH_NAMES[cur];
    return cur !== firstInQuarterMonth[i - 1] ? MONTH_NAMES[cur] : "";
  });

  let quarterTotal = 0;
  for (const [key, count] of counts) {
    const [y, m, d] = key.split("-").map(Number);
    if (y !== year) continue;
    const month = m - 1;
    if (month >= q.startMonth && month <= q.endMonth) quarterTotal += count;
  }

  return { columns, monthLabels, quarterTotal };
}

export function ActivityHeatmap({
  days = [],
  total = 0,
  year = new Date().getFullYear(),
  initialQuarter,
  className,
  ...props
}) {
  const defaultQuarter =
    typeof initialQuarter === "number"
      ? initialQuarter
      : year === new Date().getFullYear()
        ? currentQuarter()
        : 3;
  const [quarter, setQuarter] = React.useState(defaultQuarter);

  const yearMax = React.useMemo(() => {
    let max = 0;
    for (const d of days) {
      if (typeof d?.count === "number" && d.count > max) max = d.count;
    }
    return max;
  }, [days]);

  const { columns, monthLabels, quarterTotal } = React.useMemo(
    () => buildQuarterColumns(days, year, quarter, yearMax),
    [days, year, quarter, yearMax]
  );

  const goPrev = () => setQuarter((q) => (q + 3) % 4);
  const goNext = () => setQuarter((q) => (q + 1) % 4);

  return (
    <div className={cn("w-full bg-transparent", className)} {...props}>
      <div className="w-full p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-zinc-300">
            {days.length === 0
              ? `No contributions yet`
              : `${quarterTotal} contributions in ${QUARTERS[quarter].label} ${year}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous quarter"
              className="rounded-md border border-white/10 bg-zinc-900 p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-8 text-center text-[12px] font-semibold text-zinc-200">
              {QUARTERS[quarter].label}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next quarter"
              className="rounded-md border border-white/10 bg-zinc-900 p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex gap-1.5">
          <div className="flex shrink-0 flex-col" aria-hidden="true">
            {/* Spacer matching the month-label header height (10px text + 4px mb-1) */}
            <span className="h-[14px] shrink-0" />
            {/* Same row pitch as the grid: 11px cells + 3px gaps */}
            <div className="flex flex-col" style={{ gap: 3 }}>
              {WEEKDAY_LABELS.map((label, i) => (
                <span
                  key={i}
                  className="flex h-[11px] items-center text-[9px] leading-none text-zinc-500"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex" style={{ gap: 3 }} aria-hidden="true">
              {monthLabels.map((label, i) => (
                <span
                  key={i}
                  className="flex-1 overflow-visible whitespace-nowrap text-[10px] leading-none text-zinc-500"
                >
                  {label}
                </span>
              ))}
            </div>

            <div
              role="img"
              aria-label={`Contribution heatmap for ${QUARTERS[quarter].label} ${year}`}
              className="flex w-full"
              style={{ gap: 3 }}
            >
              {columns.map((week, wi) => (
                <div
                  key={wi}
                  className="flex flex-1 flex-col"
                  style={{ gap: 3 }}
                >
                  {week.map((day, di) => (
                    <div key={`${wi}-${di}`} className="group relative w-full">
                      <div
                        className={cn(
                          "h-[11px] w-full rounded-[2px]",
                          LEVELS[day.level],
                          !day.inQuarter && "opacity-0",
                          day.isFuture && "opacity-40"
                        )}
                      />
                      {day.inQuarter && !day.isFuture && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 shadow-xl shadow-black/40 group-hover:block">
                          {day.count === 0
                            ? `No contributions on ${formatDay(day.date)}`
                            : `${day.count} contribution${day.count === 1 ? "" : "s"} on ${formatDay(day.date)}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Select quarter">
            {QUARTERS.map((q, i) => (
              <button
                key={q.label}
                type="button"
                role="tab"
                aria-selected={i === quarter}
                aria-label={`${q.label} ${year}`}
                title={`${q.label} ${year}`}
                onClick={() => setQuarter(i)}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  i === quarter
                    ? "bg-green-500"
                    : "bg-zinc-700 hover:bg-zinc-500"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <span>Less</span>
            {LEVELS.map((level, i) => (
              <span key={i} className={cn("h-[10px] w-[10px] rounded-[2px]", level)} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
