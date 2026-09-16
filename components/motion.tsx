'use client';

// ─── TradeMirror · Motion Primitives ─────────────────────────────────────────
// Reveal-on-scroll + eased count-ups. All disabled under
// prefers-reduced-motion for accessibility.

import { useEffect, useRef, useState } from 'react';

export function Reveal({
  children,
  delay = 0,
  className = '',
  tour,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  tour?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced-motion is handled in CSS (@media block neutralizes .reveal),
    // so no JS fast-path is needed here.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVis(true);
          io.disconnect();
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -4% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      data-tour={tour}
      className={`reveal ${vis ? 'reveal-in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Animates from the previous value to `target` whenever it changes.
export function useCountUp(target: number, duration = 1000): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const firstRef = useRef(true);
  // Render-time read: the mount value equals the state initial on both server
  // and client, so no hydration mismatch — it only gates the animation path.
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reduced) return; // render returns `target` directly (see below)
    // First mount: count from 0 for drama; later: morph from previous value.
    const from = firstRef.current ? 0 : fromRef.current;
    firstRef.current = false;
    if (from === target) {
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const v = from + (target - from) * easeOutExpo(t);
      setVal(v);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, duration, reduced]);
  return reduced ? target : val;
}
