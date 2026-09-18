"use client";

// CommitGrid — GitHub-style contribution grid as an ambient background animation.
// Vendored from a Framer module; Framer property controls stripped, logic intact.
// Purely decorative: renders to a single <canvas> so it stays fast even with
// thousands of cells.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

// Ambient background motion doesn't need 60fps; capping the redraw rate
// roughly halves the per-frame draw cost on heavy full-screen / Retina
// cases and is imperceptible for this kind of slow, soft animation.
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1e3 / TARGET_FPS;

// Below this cell size the corner radius is invisible, so skip the
// rounded-rect path (the expensive part) and use a plain fillRect.
const MIN_ROUNDED_CELL = 3;

// Deterministic per-cell pseudo-random value in [0, 1).
function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// Value noise with smoothstep interpolation over the integer lattice,
// lerped through time — produces an organic drifting cloud.
function valueNoise(x, y, z) {
  const hash = (i, j, k) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c000 = hash(xi, yi, zi),
    c100 = hash(xi + 1, yi, zi);
  const c010 = hash(xi, yi + 1, zi),
    c110 = hash(xi + 1, yi + 1, zi);
  const c001 = hash(xi, yi, zi + 1),
    c101 = hash(xi + 1, yi, zi + 1);
  const c011 = hash(xi, yi + 1, zi + 1),
    c111 = hash(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, u),
    x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u),
    x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

// Fill one cell as a (optionally rounded) square at the current alpha.
function fillCell(ctx, x, y, size, radius, hasRoundRect) {
  if (radius <= 0) {
    ctx.fillRect(x, y, size, size);
    return;
  }
  ctx.beginPath();
  if (hasRoundRect) {
    ctx.roundRect(x, y, size, size, radius);
  } else {
    // Fallback for older Safari without roundRect
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
  }
  ctx.fill();
}

export default function CommitGrid(props) {
  const {
    baseColor = "#39d353",
    cellSize = 5,
    gap = 4,
    cornerRadius = 2,
    pattern = "scan",
    origin = "center",
    customOriginX = 50,
    customOriginY = 50,
    direction = "horizontal",
    speed = 2,
    intensity = 0.9,
    maxOpacity = 1,
    className,
    style,
  } = props;

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const gridDataRef = useRef({ cols: 0, rows: 0, originX: 0, originY: 0 });
  const animationFrameRef = useRef();
  const prefersReducedMotion = useRef(false);

  // "flat" is a static fill; treat it like speed 0 (paint once, no loop).
  const isStatic = pattern === "flat";

  // Parse any CSS color (hex #rgb / #rrggbb / #rrggbbaa or rgb()/rgba())
  // into RGB + alpha.
  const baseRGBA = useMemo(() => {
    const fallback = { r: 57, g: 211, b: 83, a: 1 };
    if (!baseColor) return fallback;
    const rgbMatch = baseColor.match(
      /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/i
    );
    if (rgbMatch) {
      return {
        r: parseFloat(rgbMatch[1]),
        g: parseFloat(rgbMatch[2]),
        b: parseFloat(rgbMatch[3]),
        a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
      };
    }
    let hex = baseColor.replace("#", "").trim();
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b, a };
    }
    return fallback;
  }, [baseColor]);

  const solidColor = useMemo(
    () => `rgb(${baseRGBA.r}, ${baseRGBA.g}, ${baseRGBA.b})`,
    [baseRGBA]
  );

  // Map a 0..1 brightness to a cell alpha. The base color's own alpha
  // scales the whole grid as a master opacity.
  const getOpacity = useCallback(
    (brightness01) => {
      const minOpacity = 0.08;
      const range = maxOpacity - minOpacity;
      const op = (minOpacity + brightness01 * range * intensity) * baseRGBA.a;
      return Math.max(0, Math.min(1, op));
    },
    [intensity, maxOpacity, baseRGBA]
  );

  // Pattern functions: (col, row, cols, rows, time) => brightness01
  const patternFunctions = useMemo(
    () => ({
      // Uniform tint — every cell the same; just rectangles, no motion.
      flat: () => 1,
      twinkle: (col, row, cols, rows, time) => {
        // Each cell gets an independent random phase AND frequency, so
        // cells never share a rhythm and the field never visibly loops.
        const phase = hash2(col, row) * Math.PI * 2;
        const freq = 0.3 + hash2(col + 13.7, row - 4.2) * 1.4;
        return Math.sin(time * speed * freq + phase) * 0.5 + 0.5;
      },
      ripple: (col, row, cols, rows, time) => {
        const { originX, originY } = gridDataRef.current;
        const dx = col - originX;
        const dy = row - originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.sin(dist * 0.5 - time * speed * 2) * 0.5 + 0.5;
      },
      wave: (col, row, cols, rows, time) => {
        let coord = 0;
        if (direction === "horizontal") coord = col;
        else if (direction === "vertical") coord = row;
        else coord = col + row;
        return Math.sin(coord * 0.3 - time * speed * 2) * 0.5 + 0.5;
      },
      scan: (col, row, cols, rows, time) => {
        let pos = 0;
        let max = 0;
        if (direction === "horizontal") {
          pos = col;
          max = cols;
        } else if (direction === "vertical") {
          pos = row;
          max = rows;
        } else {
          pos = col + row;
          max = cols + rows;
        }
        // When stopped (speed 0), light the leading edge so the
        // pattern reads as a static scan line rather than going dark.
        const scanPos = max > 0 ? ((time * speed * 5) % max) : 0;
        const dist = Math.abs(pos - scanPos);
        return Math.max(0, 1 - dist / 3);
      },
      rain: (col, row, cols, rows, time) => {
        const colPhase = ((col * 73) % 100) / 100;
        const dropPos =
          rows > 0 ? (time * speed * 3 + colPhase * rows) % rows : 0;
        const dist = Math.abs(row - dropPos);
        return Math.max(0, 1 - dist / 4);
      },
      spiral: (col, row, cols, rows, time) => {
        const { originX, originY } = gridDataRef.current;
        const dx = col - originX;
        const dy = row - originY;
        const angle = Math.atan2(dy, dx);
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.sin(angle * 3 + dist * 0.3 - time * speed * 2) * 0.5 + 0.5;
      },
      noise: (col, row, cols, rows, time) => {
        const scale = 0.15;
        return valueNoise(col * scale, row * scale, time * speed * 0.3);
      },
    }),
    [direction, speed]
  );

  // Measure container, size the canvas (DPR-aware), recompute grid layout.
  const setupCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const totalCellSize = cellSize + gap;
    const cols = Math.max(0, Math.floor((rect.width + gap) / totalCellSize));
    const rows = Math.max(0, Math.floor((rect.height + gap) / totalCellSize));
    let originX = 0;
    let originY = 0;
    if (origin === "center") {
      originX = cols / 2;
      originY = rows / 2;
    } else if (origin === "custom") {
      originX = (customOriginX / 100) * cols;
      originY = (customOriginY / 100) * rows;
    }
    gridDataRef.current = { cols, rows, originX, originY };
  }, [cellSize, gap, origin, customOriginX, customOriginY]);

  // Draw one frame: clear, then fill every cell with a per-cell alpha.
  // fillStyle stays constant; only globalAlpha changes per cell (cheap).
  const drawFrame = useCallback(
    (time) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { cols, rows } = gridDataRef.current;
      const totalCellSize = cellSize + gap;
      // Only round when the radius is actually visible; tiny cells fall
      // back to plain (fast) fillRect via radius 0.
      const radius =
        cellSize >= MIN_ROUNDED_CELL
          ? Math.min(cornerRadius, cellSize / 2)
          : 0;
      const patternFn = patternFunctions[pattern];
      const reduced = prefersReducedMotion.current;
      const hasRoundRect = typeof ctx.roundRect === "function";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = solidColor;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const brightness = reduced
            ? hash2(col + 0.5, row + 0.5)
            : patternFn(col, row, cols, rows, time);
          ctx.globalAlpha = getOpacity(brightness);
          fillCell(
            ctx,
            col * totalCellSize,
            row * totalCellSize,
            cellSize,
            radius,
            hasRoundRect
          );
        }
      }
      ctx.globalAlpha = 1;
    },
    [cellSize, gap, cornerRadius, pattern, patternFunctions, solidColor, getOpacity]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    setupCanvas();
    drawFrame(0);
    // Anything that paints a single static frame (reduced motion, speed 0,
    // or the flat pattern) skips the animation loop entirely.
    const animates = !prefersReducedMotion.current && speed > 0 && !isStatic;
    // Accumulated animation time, preserved across pauses so the pattern
    // resumes smoothly (no jump back to frame 0) when scrolled back in.
    let accumulated = 0;
    let resumeAt = 0;
    let lastDraw = 0;
    let running = false;
    const loop = (now) => {
      animationFrameRef.current = requestAnimationFrame(loop);
      // Throttle to TARGET_FPS — skip frames that arrive too soon.
      if (now - lastDraw < FRAME_INTERVAL) return;
      lastDraw = now;
      drawFrame(accumulated + (now - resumeAt) / 1e3);
    };
    const start = () => {
      if (running) return;
      running = true;
      resumeAt = performance.now();
      lastDraw = 0;
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      accumulated += (performance.now() - resumeAt) / 1e3;
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
    const resizeObserver = new ResizeObserver(() => {
      setupCanvas();
      // Repaint immediately while the loop isn't actively drawing.
      if (!running) drawFrame(animates ? accumulated : 0);
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    // Only run the loop while the grid is actually on-screen, so off-canvas
    // / scrolled-away instances cost nothing. (rAF already pauses on hidden
    // tabs; this also pauses on off-screen elements in a visible tab.)
    let intersectionObserver = null;
    if (animates) {
      if (
        typeof IntersectionObserver !== "undefined" &&
        containerRef.current
      ) {
        intersectionObserver = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) start();
          else stop();
        });
        intersectionObserver.observe(containerRef.current);
      } else {
        // No IntersectionObserver support — fall back to always running.
        start();
      }
    }
    return () => {
      stop();
      resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
    };
  }, [setupCanvas, drawFrame, speed, isStatic]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden bg-transparent", className)}
      style={style}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
