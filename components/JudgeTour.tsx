'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TourStep {
  tour: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourFab({
  fresh,
  onOpen,
  onDismiss,
}: {
  fresh: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {fresh && (
        <div
          className="font-num flex max-w-[248px] items-start gap-2 rounded-2xl p-3 text-[12px] font-semibold leading-snug"
          style={{
            background: 'var(--surface-4, var(--surface-2))',
            border: '1px solid var(--accent)',
            boxShadow: 'var(--glow)',
            color: 'var(--ink)',
          }}
        >
          <span>New here? Take the 60-second guided tour.</span>
          <button
            onClick={onDismiss}
            aria-label="Dismiss tour suggestion"
            className="font-num shrink-0 rounded px-1 text-[12px]"
            style={{ color: 'var(--ink-3)' }}
          >
            ✕
          </button>
        </div>
      )}
      <button
        onClick={onOpen}
        title="Take the guided tour (60 seconds)"
        aria-label="Take the guided tour"
        className={`grid h-12 w-12 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95 ${fresh ? 'live-dot' : ''}`}
        style={{ background: 'var(--accent)', color: '#04121a', boxShadow: 'var(--card-shadow)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M10 8.5v7l6-3.5z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

export default function JudgeTour({
  steps,
  open,
  onClose,
  onCite,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
  onCite?: (orderId: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Re-opening the tour restarts at step 0 (render-time adjust: no cascade)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIdx(0);
  }

  const measure = useCallback((tour: string) => {
    const el = document.querySelector(`[data-tour="${tour}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    }, 420);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Deferred a tick so overlay measurement settles in a callback, not mid-effect.
    const t = window.setTimeout(() => measure(steps[idx].tour), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(steps.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, idx, steps, measure, onClose]);

  // Demo beat: when the tour reaches the log, spotlight a real flagged order.
  useEffect(() => {
    if (open && steps[idx]?.tour === 'log' && onCite) {
      const first = document.querySelector('[id^="log-"]');
      const id = first?.id.replace(/^log-/, '');
      if (id) onCite(id);
    }
  }, [open, idx, steps, onCite]);

  if (!open) return null;
  const step = steps[idx];
  const below = rect ? rect.top + rect.height + 12 : 120;
  const flipUp = rect ? below + 190 > window.innerHeight : false;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Guided tour">
      {/* dimmed surround */}
      {rect ? (
        <>
          <div className="absolute left-0 right-0 top-0" style={{ height: rect.top, background: 'rgba(2,6,12,0.72)' }} />
          <div className="absolute bottom-0 left-0 right-0" style={{ top: rect.top + rect.height, background: 'rgba(2,6,12,0.72)' }} />
          <div className="absolute left-0" style={{ top: rect.top, height: rect.height, width: rect.left, background: 'rgba(2,6,12,0.72)' }} />
          <div className="absolute right-0" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width, background: 'rgba(2,6,12,0.72)' }} />
          <div
            className="absolute rounded-2xl"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              border: '2px solid var(--accent)',
              boxShadow: '0 0 0 4px rgba(103,232,249,0.15), 0 0 48px rgba(103,232,249,0.25)',
              transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(2,6,12,0.72)' }} />
      )}

      {/* tooltip card */}
      <div
        className="absolute left-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl p-4"
        style={{
          top: rect ? (flipUp ? Math.max(12, rect.top - 208) : Math.min(window.innerHeight - 208, below)) : 120,
          background: 'var(--surface-4, var(--surface-2))',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <div className="font-num text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
          Guided tour · {idx + 1}/{steps.length} · 60 seconds
        </div>
        <div className="mt-1 text-[15px] font-bold">{step.title}</div>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {step.body}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="font-num rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
          >
            ← Back
          </button>
          {idx < steps.length - 1 ? (
            <button
              onClick={() => setIdx((i) => i + 1)}
              className="rounded-lg px-4 py-1.5 text-[12px] font-bold"
              style={{ background: 'var(--accent)', color: '#04121a' }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-1.5 text-[12px] font-bold"
              style={{ background: 'var(--alpha)', color: '#04140c' }}
            >
              ✓ Explore the desk
            </button>
          )}
          <button onClick={onClose} className="font-num ml-auto text-[12px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>
            skip
          </button>
        </div>
        <div className="mt-2 flex gap-1">
          {steps.map((s, i) => (
            <div key={s.tour} className="h-1 flex-1 rounded-full" style={{ background: i <= idx ? 'var(--accent)' : 'var(--surface-3)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
