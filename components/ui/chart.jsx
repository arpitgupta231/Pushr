"use client";
import * as React from "react";
import { cn } from "cn";

const X_SPACING = 150;
const Y_MAIN = 70;
const LANE_DY = 44;
const PAD_LEFT = 30;
const PAD_RIGHT = 30;
const PAD_Y = 32;
const MIN_H = 160;
const LANE_COLORS = ["#4ade80", "#a7f3d0", "#86efac", "#6ee7b7", "#34d399"];

function laneY(lane) {
  if (lane === 0) return Y_MAIN;
  return lane % 2 === 1
    ? Y_MAIN - LANE_DY * Math.ceil(lane / 2)
    : Y_MAIN + LANE_DY * (lane / 2);
}

function buildLayout(commits) {
  const laneOf = {};
  let nextLane = 1;
  return commits.map((c, i) => {
    if (!(c.branch in laneOf)) {
      laneOf[c.branch] = c.branch === "main" ? 0 : nextLane++;
    }
    const lane = laneOf[c.branch];
    return { ...c, x: PAD_LEFT + i * X_SPACING, lane, y: laneY(lane) };
  });
}

function buildPaths(nodes, mainY) {
  const mainNodes = nodes.filter((n) => n.lane === 0);
  const laneNodes = {};
  for (const n of nodes) {
    (laneNodes[n.lane] = laneNodes[n.lane] || []).push(n);
  }

  const xs = nodes.map((n) => n.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const mainPath = `M ${minX} ${mainY} L ${maxX} ${mainY}`;

  const branchPaths = [];
  for (const [laneStr, laneCommits] of Object.entries(laneNodes)) {
    const lane = Number(laneStr);
    if (lane === 0) continue;
    const y = laneCommits[0].y;
    const first = laneCommits[0];
    const last = laneCommits[laneCommits.length - 1];
    // branch point: last main commit strictly before the branch's first commit
    const bp = mainNodes.filter((m) => m.x < first.x).at(-1);
    // merge point: first main commit strictly after the branch's last commit
    const mp = mainNodes.find((m) => m.x > last.x);

    let d = bp
      ? `M ${bp.x} ${mainY} L ${first.x} ${y}`
      : `M ${first.x} ${y}`;

    for (const c of laneCommits.slice(1)) {
      d += ` L ${c.x} ${y}`;
    }
    if (mp) d += ` L ${mp.x} ${mainY}`;

    branchPaths.push({
      lane,
      color: LANE_COLORS[lane % LANE_COLORS.length],
      path: d,
      branch: first.branch,
      labelX: first.x,
      y,
    });
  }

  return { mainPath, branchPaths, mainY };
}

export function ChartContainer({
  commits = [],
  className,
  ...props
}) {
  // hovered holds both the commit node and the circle element it belongs to
  const [hovered, setHovered] = React.useState(null);
  const [tooltipPos, setTooltipPos] = React.useState(null);
  const rootRef = React.useRef(null);

  // Approximate tooltip size, used for placement decisions
  const TOOLTIP_GAP = 12;
  const TOOLTIP_H = 84;
  const TOOLTIP_HALF_W = 130;

  const placeTooltip = React.useCallback((el) => {
    const root = rootRef.current;
    if (!el || !root) return null;
    const dotRect = el.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    // The tooltip lives OUTSIDE the scrollable area (it's a sibling of the
    // scroller, inside this relative wrapper), so these viewport-relative
    // coordinates are always correct. On scroll we simply recompute them to
    // keep the tooltip glued to its dot.
    const left = dotRect.left + dotRect.width / 2 - rootRect.left;
    const top = dotRect.top - rootRect.top;
    const clampedLeft = Math.min(
      Math.max(left, TOOLTIP_HALF_W),
      Math.max(TOOLTIP_HALF_W, rootRect.width - TOOLTIP_HALF_W)
    );
    return {
      left: clampedLeft,
      top,
      // If there isn't room above the dot *within the chart area*, flip below.
      above: dotRect.top - rootRect.top >= TOOLTIP_H + TOOLTIP_GAP,
    };
  }, []);

  const rawNodes = React.useMemo(() => buildLayout(commits), [commits]);

  const { nodes, mainY, width, height } = React.useMemo(() => {
    if (rawNodes.length === 0) return { nodes: [], mainY: 0, width: 0, height: 0 };
    const ys = rawNodes.map((n) => n.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const contentH = maxY - minY + PAD_Y * 2;
    const svgH = Math.max(contentH, MIN_H);
    const shift = PAD_Y - minY + (svgH - contentH) / 2;
    const adj = rawNodes.map((n) => ({ ...n, y: n.y + shift }));
    const w = Math.max(...adj.map((n) => n.x)) + PAD_RIGHT;
    return { nodes: adj, mainY: Y_MAIN + shift, width: w, height: svgH };
  }, [rawNodes]);

  const { mainPath, branchPaths } = React.useMemo(
    () => (nodes.length === 0 ? { mainPath: "", branchPaths: [] } : buildPaths(nodes, mainY)),
    [nodes, mainY]
  );

  if (commits.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center text-sm text-zinc-500",
          className
        )}
        {...props}
      >
        No commits yet
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative bg-black", className)} {...props}>
      <div
        className="git-graph-scroll min-h-[160px] overflow-x-auto"
        onScroll={() => {
          if (hovered) setTooltipPos(placeTooltip(hovered.el));
        }}
      >
      <div
        className="min-h-[160px] w-max min-w-full"
        style={{ minWidth: width }}
      >
      <svg
        width={width}
        height={height}
        className="block"
        style={{ minWidth: "100%" }}
      >
        <defs>
          <linearGradient
            id="grad-main"
            gradientUnits="userSpaceOnUse"
            x1={PAD_LEFT}
            y1={mainY}
            x2={width - PAD_RIGHT}
            y2={mainY}
          >
            <stop offset="0%" stopColor="#059669" />
            <stop offset="50%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#86efac" />
          </linearGradient>
          {branchPaths.map((bp) => {
            const laneNodes = nodes.filter((n) => n.lane === bp.lane);
            const bx1 = laneNodes[0].x;
            const bx2 = laneNodes[laneNodes.length - 1].x;
            return (
              <linearGradient
                key={"grad-" + bp.lane}
                id={"grad-lane-" + bp.lane}
                gradientUnits="userSpaceOnUse"
                x1={bx1}
                y1={bp.y}
                x2={bx2}
                y2={bp.y}
              >
                <stop offset="0%" stopColor={bp.color} stopOpacity={0.4} />
                <stop offset="50%" stopColor={bp.color} stopOpacity={1} />
                <stop offset="100%" stopColor={bp.color} stopOpacity={0.6} />
              </linearGradient>
            );
          })}
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <line x1="20" y1="0" x2="20" y2="20" stroke="#3f3f46" strokeWidth="1" />
            <line x1="0" y1="20" x2="20" y2="20" stroke="#3f3f46" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={0} y={0} width="100%" height={height} fill="url(#grid)" />
        <path
          d={mainPath}
          stroke="url(#grad-main)"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
        {branchPaths.map((bp) => (
          <path
            key={"branch-" + bp.lane}
            d={bp.path}
            stroke={"url(#grad-lane-" + bp.lane + ")"}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        {nodes.map((n) => (
          <circle
            key={n.sha}
            cx={n.x}
            cy={n.y}
            r={4}
            fill={n.lane === 0 ? "#4ade80" : LANE_COLORS[n.lane % LANE_COLORS.length]}
            stroke="#052e16"
            strokeWidth={1.2}
            className="cursor-pointer"
            onMouseEnter={(e) => {
              setTooltipPos(placeTooltip(e.currentTarget));
              setHovered({ node: n, el: e.currentTarget });
            }}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {branchPaths.map((bp) => (
          <text
            key={"label-" + bp.lane}
            x={bp.labelX - 8}
            y={bp.y - 16}
            textAnchor="end"
            className="fill-green-300/70 font-mono text-[11px]"
          >
            {bp.branch}
          </text>
        ))}
      </svg>
      </div>
      </div>

      {hovered && tooltipPos && (
        <div
          className="pointer-events-none absolute z-50 max-w-[260px] border border-white/10 bg-zinc-900 px-3 py-2 shadow-2xl shadow-black/40"
          style={{
            left: tooltipPos.left,
            top: tooltipPos.top,
            transform: tooltipPos.above
              ? `translate(-50%, calc(-100% - ${TOOLTIP_GAP}px))`
              : "translate(-50%, 16px)",
          }}
        >
          <p className="font-mono text-xs font-semibold text-green-400">
            {hovered.node.sha}
          </p>
          <p className="mt-0.5 text-sm text-zinc-200">{hovered.node.message}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{hovered.node.date}</p>
        </div>
      )}
    </div>
  );
}
