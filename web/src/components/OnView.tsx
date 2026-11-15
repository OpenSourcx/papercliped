import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders `children` only once the placeholder scrolls near the viewport, and never when the visitor prefers reduced motion (they get
 * `fallback` instead). Keeps animated demos from running, or being downloaded, before anyone can see them.
 */
export function OnView({ children, fallback = null, minHeight = 320, rootMargin = "200px" }: { children: ReactNode; fallback?: ReactNode; minHeight?: number; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setCalm(true); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShow(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return <div ref={ref} style={show ? undefined : { minHeight }}>{calm ? fallback : show ? children : null}</div>;
}
