"use client";

import { useEffect, useRef, useState } from "react";
import { useSeason } from "@/contexts/SeasonContext";

type Flake = {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Gentle snowfall (Christmas) or drifting gold sparks (New Year) behind a section.
 * Lightweight canvas: pauses off-screen / in background tabs, absent under
 * prefers-reduced-motion, and the visitor can switch it off (remembered).
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

    const gold = theme === "new_year";
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let running = true;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(46, Math.max(18, width / 28)) * (gold ? 0.6 : 1));
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: gold ? 1 + Math.random() * 1.6 : 1.2 + Math.random() * 2.6,
        speed: gold ? 0.12 + Math.random() * 0.22 : 0.25 + Math.random() * 0.55,
        drift: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        f.y += f.speed;
        f.x += Math.sin(t / 1800 + f.phase) * f.drift * 0.35;
        if (f.y - f.r > height) {
          f.y = -f.r;
          f.x = Math.random() * width;
        }
        if (gold) {
          const a = 0.35 + 0.45 * Math.abs(Math.sin(t / 700 + f.phase));
          ctx.fillStyle = `rgba(217, 164, 65, ${a.toFixed(3)})`;
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
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
        <span aria-hidden="true">{theme === "christmas" ? "❄" : "✦"}</span>
        <span className="season-snow-toggle-label" aria-hidden="true">
          {theme === "christmas" ? "Snow" : "Sparkle"}{" "}
          {snowEnabled ? "off" : "on"}
        </span>
      </button>
    </>
  );
}
