"use client";

import { useEffect, useRef, useState } from "react";
import { Snowflake, Sparkles as SparklesIcon } from "lucide-react";
import { useSeason } from "@/contexts/SeasonContext";

type Kind = "speck" | "clump" | "crystal" | "bokeh" | "mote" | "glint";

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  /** Radius in CSS px. */
  r: number;
  /** Fall speed, px/s (negative for rising New Year sparks). */
  vy: number;
  /** How strongly the wind carries it (light flakes follow, heavy ones barely). */
  wind: number;
  /** Own flutter: amplitude (px/s), angular frequency (rad/s), phase. */
  flutter: number;
  freq: number;
  phase: number;
  alpha: number;
  rot: number;
  spin: number;
  variant: number;
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function sprite(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) paint(ctx, size);
  return c;
}

/** Small deterministic random so the crystal variants look the same every load. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distant speck: a crisp white dot with a faint cool rim so it still shows on cream. */
function speckSprite() {
  return sprite(32, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.34, "rgba(255,255,255,1)");
    g.addColorStop(0.6, "rgba(146,172,200,0.9)");
    g.addColorStop(0.82, "rgba(146,172,200,0.35)");
    g.addColorStop(1, "rgba(146,172,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Fluffy aggregate flake: a few overlapping soft lobes, never a perfect circle. */
function clumpSprite(seed: number) {
  const rnd = seeded(seed);
  return sprite(64, (ctx, s) => {
    const c = s / 2;
    const lobes = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < lobes; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * s * 0.14;
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d;
      const r = s * (0.2 + rnd() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.98)");
      g.addColorStop(0.62, "rgba(252,254,255,0.9)");
      g.addColorStop(0.74, "rgba(150,176,204,0.75)");
      g.addColorStop(0.9, "rgba(150,176,204,0.3)");
      g.addColorStop(1, "rgba(150,176,204,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Six-armed ice crystal with side branches; each variant branches differently. */
function crystalSprite(seed: number) {
  const rnd = seeded(seed);
  return sprite(96, (ctx, s) => {
    const R = s * 0.43;
    const branches = 2 + Math.floor(rnd() * 2);
    const sideLen = 0.3 + rnd() * 0.12;
    const fork = rnd() > 0.4;
    ctx.translate(s / 2, s / 2);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "rgba(96,128,160,0.75)";
    ctx.shadowBlur = 3;
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 3);
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -R);
      ctx.stroke();
      ctx.lineWidth = 3;
      for (let b = 1; b <= branches; b++) {
        const y = -R * (b / (branches + 0.7));
        const len = R * sideLen * (1.15 - b * 0.2);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(side * len * 0.866, y - len * 0.5);
          ctx.stroke();
        }
      }
      if (fork) {
        const len = R * 0.2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, -R);
          ctx.lineTo(side * len * 0.7, -R - len * 0.5);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Large out-of-focus flake close to the camera: a soft disc that melts into the background. */
function bokehSprite() {
  return sprite(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.55, "rgba(255,255,255,0.7)");
    g.addColorStop(0.82, "rgba(196,212,228,0.35)");
    g.addColorStop(1, "rgba(196,212,228,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Champagne mote for New Year. */
function moteSprite() {
  return sprite(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,244,196,1)");
    g.addColorStop(0.3, "rgba(236,196,98,0.9)");
    g.addColorStop(1, "rgba(217,164,65,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Four-point foil glint. */
function glintSprite() {
  return sprite(64, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, "#b3832e");
    g.addColorStop(0.45, "#fff0b5");
    g.addColorStop(1, "#c9993a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(c, 1);
    ctx.quadraticCurveTo(c, c, s - 1, c);
    ctx.quadraticCurveTo(c, c, c, s - 1);
    ctx.quadraticCurveTo(c, c, 1, c);
    ctx.quadraticCurveTo(c, c, c, 1);
    ctx.fill();
  });
}

/** Slowly shifting wind in px/s: two drifting sines plus an occasional gust. */
function windAt(t: number): number {
  const base = 14 * Math.sin(t / 7000) + 8 * Math.sin(t / 2300 + 1.3);
  const gust = Math.pow(Math.max(0, Math.sin(t / 11000 + 2)), 6) * 46;
  return base + gust;
}

function spawn(width: number, height: number, newYear: boolean, anywhere: boolean): Particle {
  const roll = Math.random();
  let kind: Kind;
  if (newYear) kind = roll < 0.22 ? "glint" : "mote";
  else if (roll < 0.03) kind = "glint";
  else if (roll < 0.43) kind = "speck";
  else if (roll < 0.74) kind = "clump";
  else if (roll < 0.945) kind = "crystal";
  else kind = "bokeh";

  const range = (a: number, b: number) => a + Math.random() * (b - a);
  const base = {
    kind,
    x: range(-60, width + 60),
    phase: Math.random() * Math.PI * 2,
    rot: Math.random() * Math.PI * 2,
    spin: 0,
    variant: Math.floor(Math.random() * 4),
  };
  let p: Omit<Particle, "y">;
  switch (kind) {
    case "speck":
      p = { ...base, r: range(1.3, 2.4), vy: range(30, 56), wind: range(0.85, 1), flutter: range(2, 7), freq: range(1.5, 3), alpha: range(0.5, 0.85) };
      break;
    case "clump":
      p = { ...base, r: range(2.8, 5), vy: range(48, 84), wind: range(0.6, 0.85), flutter: range(6, 14), freq: range(1.1, 2.2), alpha: range(0.7, 0.95) };
      break;
    case "crystal":
      p = { ...base, r: range(5, 9), vy: range(38, 70), wind: range(0.45, 0.7), flutter: range(10, 22), freq: range(0.9, 1.8), alpha: range(0.85, 1), spin: range(-0.7, 0.7) };
      break;
    case "bokeh":
      p = { ...base, r: range(15, 30), vy: range(120, 190), wind: range(0.9, 1.2), flutter: range(4, 10), freq: range(0.6, 1.2), alpha: range(0.3, 0.5) };
      break;
    case "glint":
      p = { ...base, r: newYear ? range(5, 11) : range(4, 6.5), vy: newYear ? -range(10, 24) : range(34, 52), wind: 0.5, flutter: range(6, 12), freq: range(1, 2), alpha: range(0.6, 1) };
      break;
    default: // mote
      p = { ...base, r: range(1.8, 6.5), vy: -range(8, 26), wind: 0.3, flutter: range(4, 10), freq: range(1, 2.2), alpha: range(0.35, 0.9) };
  }
  const startY = anywhere
    ? Math.random() * height
    : p.vy < 0
      ? height + p.r
      : -p.r * 2;
  return { ...p, y: startY };
}

/**
 * Snowfall (Christmas) or rising champagne sparks (New Year) behind a section.
 * Christmas snow is layered by depth: crisp distant specks, fluffy clumps, tumbling
 * six-armed crystals and a few big out-of-focus flakes, all pushed by a slowly
 * shifting wind with gusts (plus the odd gold glint). Lightweight canvas: pauses
 * off-screen / in background tabs, absent under prefers-reduced-motion, and the
 * visitor can switch it off (remembered).
 */
export default function Snowfall() {
  const { theme, snowEnabled, setSnowEnabled } = useSeason();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  const active = Boolean(theme) && snowEnabled && !reduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newYear = theme === "new_year";
    const sprites = {
      speck: speckSprite(),
      clump: [clumpSprite(11), clumpSprite(23), clumpSprite(37), clumpSprite(59)],
      crystal: [crystalSprite(3), crystalSprite(17), crystalSprite(29), crystalSprite(41)],
      bokeh: bokehSprite(),
      mote: moteSprite(),
      glint: glintSprite(),
    };
    ctx.imageSmoothingQuality = "high";
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    let running = true;
    let visible = true;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(220, Math.max(80, width / 6.5)) * (newYear ? 0.3 : 1));
      particles = Array.from({ length: count }, () => spawn(width, height, newYear, true));
    };

    const draw = (t: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const wind = windAt(t);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        // tumbling flakes speed up and slow down as they flutter
        const bob = p.kind === "crystal" || p.kind === "clump" ? 1 + 0.16 * Math.sin(t / 1000 * p.freq * 1.7 + p.phase) : 1;
        p.y += p.vy * bob * dt;
        p.x += (wind * p.wind + Math.sin((t / 1000) * p.freq + p.phase) * p.flutter) * dt;
        p.rot += p.spin * dt;

        const gone = p.vy < 0 ? p.y < -p.r * 2 : p.y > height + p.r * 2;
        if (gone || p.x < -90 || p.x > width + 90) {
          particles[i] = spawn(width, height, newYear, false);
          continue;
        }

        // ease in near the top (or bottom for rising sparks) so nothing pops into view
        const edge = p.vy < 0 ? height - p.y : p.y;
        let a = p.alpha * Math.min(1, Math.max(0, edge / 36 + 0.15));
        if (p.kind === "glint" || (newYear && p.kind === "mote")) {
          a *= 0.5 + 0.5 * Math.abs(Math.sin(t / 700 + p.phase));
        }
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;

        const d = p.r * 2;
        switch (p.kind) {
          case "crystal": {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.drawImage(sprites.crystal[p.variant], -p.r, -p.r, d, d);
            ctx.restore();
            break;
          }
          case "clump":
            ctx.drawImage(sprites.clump[p.variant], p.x - p.r, p.y - p.r, d, d);
            break;
          case "speck":
            ctx.drawImage(sprites.speck, p.x - p.r, p.y - p.r, d, d);
            break;
          case "bokeh":
            ctx.drawImage(sprites.bokeh, p.x - p.r, p.y - p.r, d, d);
            break;
          case "glint":
            ctx.drawImage(sprites.glint, p.x - p.r, p.y - p.r, d, d);
            break;
          default:
            ctx.drawImage(sprites.mote, p.x - p.r, p.y - p.r, d, d);
        }
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    const start = () => {
      if (frame || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    resize();
    start();

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    observer.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, [active, theme]);

  if (!theme || reduced) return null;

  const Icon = theme === "christmas" ? Snowflake : SparklesIcon;

  return (
    <>
      {active && (
        <canvas ref={canvasRef} className="season-snow-canvas" aria-hidden="true" />
      )}
      <button
        type="button"
        className="season-snow-toggle"
        onClick={() => setSnowEnabled(!snowEnabled)}
        aria-pressed={!snowEnabled}
        aria-label={`${snowEnabled ? "Turn off" : "Turn on"} ${
          theme === "christmas" ? "falling snow" : "sparkles"
        }`}
      >
        <Icon className="season-snow-toggle-icon" strokeWidth={2} aria-hidden="true" />
        <span className="season-snow-toggle-label" aria-hidden="true">
          {theme === "christmas" ? "Snow" : "Sparkle"}{" "}
          {snowEnabled ? "off" : "on"}
        </span>
      </button>
    </>
  );
}
