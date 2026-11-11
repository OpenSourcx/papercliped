import { useEffect, useRef } from "react";

/**
 * A decorative drifting field of pin glyphs, drawn on a canvas. Our own code and shapes.
 * Never carries meaning. Static under prefers-reduced-motion, hidden at 375 px and below,
 * paused while off screen or the tab is hidden, capped at 24 fps, no per-frame allocation.
 */
export const PIN_FIELD_MIN_WIDTH = 376;
export const PIN_FIELD_FPS = 24;
const COUNT = 22;

interface Sprite { x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; s: number }

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

export function PinField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia(`(max-width: ${PIN_FIELD_MIN_WIDTH - 1}px)`).matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rnd = seeded(7);
    const sprites: Sprite[] = Array.from({ length: COUNT }, () => ({
      x: rnd(), y: rnd(), vx: (rnd() - 0.5) * 0.004, vy: (rnd() - 0.5) * 0.004, r: rnd() * Math.PI * 2, va: (rnd() - 0.5) * 0.02, a: 0.25 + rnd() * 0.5, s: 6 + rnd() * 10,
    }));
    let w = 0, h = 0, raf = 0, last = 0, visible = true, running = false;
    const color = () => getComputedStyle(canvas).color;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color(); ctx.lineWidth = 1.5; ctx.lineCap = "round";
      for (const p of sprites) {
        ctx.globalAlpha = p.a * 0.5;
        ctx.save(); ctx.translate(p.x * w, p.y * h); ctx.rotate(p.r);
        // a pushpin: head, shaft, point
        ctx.beginPath(); ctx.moveTo(-p.s / 2, -p.s / 2); ctx.lineTo(p.s / 2, -p.s / 2);
        ctx.moveTo(0, -p.s / 2); ctx.lineTo(0, p.s / 2); ctx.stroke();
        ctx.restore();
      }
    };
    const frame = (t: number) => {
      raf = 0;
      if (!running) return;
      if (t - last >= 1000 / PIN_FIELD_FPS) {
        last = t;
        for (const p of sprites) {
          p.x += p.vx; p.y += p.vy; p.r += p.va;
          if (p.x < -0.05) p.x = 1.05; else if (p.x > 1.05) p.x = -0.05;
          if (p.y < -0.05) p.y = 1.05; else if (p.y > 1.05) p.y = -0.05;
        }
        draw();
      }
      raf = requestAnimationFrame(frame);
    };
    const update = () => {
      const want = !reduced && visible && !document.hidden;
      if (want && !running) { running = true; raf = requestAnimationFrame(frame); }
      else if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    };
    size(); draw();
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; update(); });
    io?.observe(canvas);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { size(); draw(); });
    ro?.observe(canvas);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect(); ro?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return <canvas ref={ref} aria-hidden="true" data-testid="pin-field" className={`pin-field pointer-events-none absolute inset-0 h-full w-full text-ink max-[375px]:hidden ${className}`} />;
}
