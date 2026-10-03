"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * PixelPreloader — original recreation inspired by the "pixel grid preloader"
 * concept (full-bleed pixel field + glowing frontier + live % counter).
 * Not affiliated with / copied from the paid Framer component — all code here
 * is written from scratch for Pushr.
 *
 * Fill modes (all reach full coverage at 100%):
 *  rise | scan | ring | curtain | blinds | checker | diagonal | blocks
 *
 * Modes:
 *  - auto:   progress runs 0→100 over `duration` ms (then holds, fades, fires onComplete)
 *  - manual: progress driven by the `progress` prop (0-100). Still repaints
 *            every frame, so externally-driven progress animates as smoothly
 *            as auto mode — the parent only has to feed it a changing number.
 */

const FILL_MODES = ["rise", "scan", "ring", "curtain", "blinds", "checker", "diagonal", "blocks"];

const COUNTER_POSITIONS = {
  "top-left": "items-start justify-start p-8 text-left",
  "top-center": "items-start justify-center p-8 text-center",
  "top-right": "items-start justify-end p-8 text-right",
  "center-left": "items-center justify-start p-8 text-left",
  center: "items-center justify-center text-center",
  "center-right": "items-center justify-end p-8 text-right",
  "bottom-left": "items-end justify-start p-8 text-left",
  "bottom-center": "items-end justify-center p-8 text-center",
  "bottom-right": "items-end justify-end p-8 text-right",
};

function pseudoRandom(col, row) {
  const x = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function cellThreshold(fillMode, col, row, cols, rows) {
  const safeCols = Math.max(cols - 1, 1);
  const safeRows = Math.max(rows - 1, 1);
  const total = Math.max(cols + rows - 2, 1);
  switch (fillMode) {
    case "rise":
      // bottom-up
      return (rows - 1 - row) / rows;
    case "scan":
      // left-to-right scan
      return col / cols;
    case "ring": {
      // center-out circle (corners last)
      const nx = (col + 0.5) / cols - 0.5;
      const ny = (row + 0.5) / rows - 0.5;
      const d = Math.sqrt(nx * nx + ny * ny) / Math.SQRT1_2 / 2;
      return Math.min(Math.max(d, 0), 1);
    }
    case "curtain": {
      // outer vertical edges → center
      const edge = Math.min(col, cols - 1 - col) / (cols / 2);
      return 1 - Math.min(Math.max(edge, 0), 1);
    }
    case "blinds": {
      // 6 horizontal blinds, staggered left-to-right
      const bands = 6;
      const band = Math.min(Math.floor((row / rows) * bands), bands - 1);
      const stagger = 0.14;
      const span = 1 + stagger * (bands - 1);
      return (band * stagger + col / safeCols) / span;
    }
    case "checker": {
      const base = (col + row) / total;
      const parity = (col + row) % 2;
      return base * 0.5 + parity * 0.5;
    }
    case "diagonal":
      return (col + row) / total;
    case "blocks":
      return pseudoRandom(col, row);
    default:
      return (rows - 1 - row) / rows;
  }
}

function isLightColor(color) {
  if (!color || typeof color !== "string") return false;
  // crude luminance check for hex colors only
  const hex = color.replace("#", "");
  if (hex.length !== 6 && hex.length !== 3) return false;
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6;
}

function PixelIcon({ icon = "pulse", color = "#4ade80" }) {
  const px = { imageRendering: "pixelated", backgroundColor: color };
  switch (icon) {
    case "orbit":
      return (
        <span className="relative block h-5 w-5 animate-spin [animation-duration:1.2s]">
          <span className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2" style={px} />
          <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 opacity-40" style={px} />
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 opacity-70" style={px} />
        </span>
      );
    case "wave":
      return (
        <span className="flex items-end gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1.5 animate-bounce"
              style={{
                ...px,
                height: 8 + (i % 3) * 4,
                animationDelay: `${i * 0.12}s`,
                animationDuration: "0.9s",
              }}
            />
          ))}
        </span>
      );
    case "dots":
      return (
        <span className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-pulse"
              style={{ ...px, animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </span>
      );
    case "clock":
      return (
        <span className="relative block h-5 w-5 border-2" style={{ borderColor: color }}>
          <span
            className="absolute left-1/2 top-1/2 h-[8px] w-[2px] origin-bottom animate-spin [animation-duration:2s]"
            style={{ ...px, transform: "translate(-50%,-100%)", transformOrigin: "50% 100%" }}
          />
        </span>
      );
    case "hourglass":
      return (
        <span className="flex animate-pulse flex-col items-center gap-[2px] [animation-duration:1.4s]">
          <span className="h-1.5 w-4" style={px} />
          <span className="h-1.5 w-2" style={{ ...px, opacity: 0.7 }} />
          <span className="h-1.5 w-1.5" style={{ ...px, opacity: 0.45 }} />
          <span className="h-1.5 w-3" style={{ ...px, opacity: 0.8 }} />
        </span>
      );
    case "bounce":
      return <span className="block h-3 w-3 animate-bounce" style={px} />;
    case "pulse":
    default:
      return (
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping opacity-60" style={px} />
          <span className="relative inline-flex h-3 w-3" style={px} />
        </span>
      );
  }
}

export function PixelPreloader({
  // progress driver
  mode = "auto", // "auto" | "manual"
  progress = 0, // 0-100, used when mode === "manual"
  fillMode = "rise",
  duration = 2200, // ms for 0→100 in auto mode
  loop = false,
  speed = 1,
  // look
  pixelSize = 14,
  gap = 4,
  fill = "#118d04",
  accent = "#4ade80",
  gridColor = "rgba(255,255,255,0.07)",
  background = "#09090b",
  glow = true,
  shimmer = true,
  // counter
  showCounter = true,
  counterPosition = "center",
  counterColor = "#fafafa",
  counterLabel = "LOCKING IN YOUR RIVALRY",
  icon = "pulse",
  iconColor,
  // behavior
  autoHide = true,
  holdMs = 350,
  fadeMs = 500,
  onComplete,
  replayKey = 0,
  className,
  style,
  ...props
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  // Remount on replayKey (parent passes key={replayKey}) gives us a fresh
  // state for free — no reset effect needed.
  const [displayProgress, setDisplayProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(true);
  const paintRef = useRef(null);
  const stateRef = useRef({ p: 0, last: 0, done: false, visible: true });

  const safeFillMode = FILL_MODES.includes(fillMode) ? fillMode : "rise";
  const glowEnabled = glow && !isLightColor(background);

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // TEMP diagnostic — confirms the overlay actually mounts. Remove once verified.
  useEffect(() => {
    console.debug("[PixelPreloader] mounted");
  }, []);

  // Latest onComplete without making it a dep of the manual-mode effect below:
  // an unstable identity there would re-run the effect mid-fade.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Manual mode reads progress through a ref so the draw loop below never has
  // to restart — a restart would reset its rAF clock and stall a frame of
  // motion on every parent update.
  const progressRef = useRef(0);
  useEffect(() => {
    if (mode === "manual") {
      progressRef.current = Math.min(Math.max(progress, 0), 100) / 100;
    }
  }, [mode, progress]);

  // One draw loop for both modes. It only *renders* each frame; auto mode also
  // advances progress from elapsed time, manual mode mirrors the ref above.
  // Either way the field is repainted continuously, so the fill glides and the
  // shimmer stays alive instead of stepping in discrete jumps.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let inView = true;
    let holdTimer = null;
    let fadeTimer = null;
    const s = stateRef.current;
    s.last = performance.now();

    const step = pixelSize + gap;
    const frontierWidth = 0.055;

    // Pure render — reads s.p, never advances it. Split from the loop so the
    // reduced-motion path can paint one static frame without a rAF.
    const paint = (now) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cols = Math.max(1, Math.ceil(w / step));
      const rows = Math.max(1, Math.ceil(h / step));
      const ox = (w - cols * step + gap) / 2;
      const oy = (h - rows * step + gap) / 2;
      const t = now / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const threshold = cellThreshold(safeFillMode, col, row, cols, rows);
          const filled = s.p >= threshold;
          const frontier = !filled && threshold - s.p < frontierWidth;
          const x = ox + col * step;
          const y = oy + row * step;

          if (filled) {
            let alpha = 1;
            if (shimmer) alpha = 0.9 + 0.1 * Math.sin(t * 2.2 + (col + row) * 0.35);
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 0;
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, pixelSize, pixelSize);
          } else if (frontier) {
            ctx.globalAlpha = 1;
            if (glowEnabled) {
              ctx.shadowColor = accent;
              ctx.shadowBlur = 14;
            }
            ctx.fillStyle = accent;
            ctx.fillRect(x, y, pixelSize, pixelSize);
            ctx.shadowBlur = 0;
          } else {
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.fillStyle = gridColor;
            ctx.fillRect(x, y, pixelSize, pixelSize);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };
    paintRef.current = paint;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    if (reducedMotion) {
      // Static frame, no rAF. Auto mode jumps straight to done; manual mode just
      // holds whatever progress the parent handed us. State work is deferred to
      // a callback so the effect body stays pure.
      s.p = mode === "auto" ? 1 : progressRef.current;
      setDisplayProgress(s.p * 100);
      paint(performance.now());
      if (mode === "manual") {
        return () => ro.disconnect();
      }
      const t = setTimeout(() => {
        if (autoHide) {
          setFading(true);
          fadeTimer = setTimeout(() => {
            setVisible(false);
            onCompleteRef.current?.();
          }, Math.min(fadeMs, 300));
        } else {
          onCompleteRef.current?.();
        }
      }, 0);
      return () => {
        clearTimeout(t);
        if (fadeTimer) clearTimeout(fadeTimer);
        ro.disconnect();
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 }
    );
    io.observe(container);

    const onVis = () => {
      s.last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (!inView || document.hidden || !s.visible) return;
      const dt = Math.min(now - s.last, 100);
      s.last = now;

      if (!s.done) {
        s.p = mode === "auto" ? s.p + (dt / duration) * speed : progressRef.current;
        if (s.p >= 1) {
          s.p = 1;
          setDisplayProgress(100);
          if (loop && mode === "auto") {
            s.p = 0;
          } else {
            s.done = true;
            if (autoHide) {
              holdTimer = setTimeout(() => {
                setFading(true);
                fadeTimer = setTimeout(() => {
                  s.visible = false;
                  setVisible(false);
                  onCompleteRef.current?.();
                }, fadeMs);
              }, holdMs);
            } else {
              onCompleteRef.current?.();
            }
          }
        } else {
          setDisplayProgress(s.p * 100);
        }
      }

      paint(now);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (holdTimer) clearTimeout(holdTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [mode, duration, speed, loop, autoHide, holdMs, fadeMs, pixelSize, gap, fill, accent, gridColor, glowEnabled, shimmer, safeFillMode, reducedMotion, replayKey]);

  // Reduced motion runs no rAF, so manual progress changes need a one-shot
  // repaint to keep the field and the counter in sync with the prop. Completion
  // is mirrored here too — the loop that normally owns it never starts.
  useEffect(() => {
    if (mode !== "manual" || !reducedMotion) return;
    const paint = paintRef.current;
    if (!paint) return;
    const s = stateRef.current;
    s.p = Math.min(Math.max(progress, 0), 100) / 100;
    setDisplayProgress(s.p * 100);
    paint(performance.now());
    if (!(s.p >= 1 && autoHide) || s.done) return;
    s.done = true;
    // No cleanup: `done` guards double-scheduling, and clearing these mid-fade
    // would strand the overlay at 100% on a later progress change.
    setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setVisible(false);
        onCompleteRef.current?.();
      }, fadeMs);
    }, holdMs);
  }, [mode, reducedMotion, progress, autoHide, fadeMs, holdMs]);

  if (!visible) return null;

  const rawPct = displayProgress;
  const pct = Math.round(Math.min(Math.max(rawPct, 0), 100));
  const posCls = COUNTER_POSITIONS[counterPosition] ?? COUNTER_POSITIONS.center;

  return (
    <div
      ref={containerRef}
      role="status"
      aria-label={`Loading ${pct}%`}
      className={cn("fixed inset-0 z-[80] flex overflow-hidden transition-opacity", posCls, className)}
      style={{ background, opacity: fading ? 0 : 1, transitionDuration: `${fadeMs}ms`, ...style }}
      {...props}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {showCounter && (
        <div className="relative z-10 flex flex-col items-center gap-3">
          <PixelIcon icon={icon} color={iconColor ?? accent} />
          <p
            className="font-mono text-6xl font-bold tabular-nums"
            style={{ color: counterColor, textShadow: glowEnabled ? `0 0 24px ${accent}` : undefined }}
          >
            {pct}
            <span className="text-2xl">%</span>
          </p>
          {counterLabel && (
            <p className="font-mono text-[11px] tracking-[0.3em] uppercase opacity-70" style={{ color: counterColor }}>
              {counterLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const PIXEL_FILL_MODES = FILL_MODES;
export default PixelPreloader;
