'use client';

import { useEffect, useState } from 'react';

const NAV: Array<{ label: string; tour: string }> = [
  { label: 'Score', tour: 'score' },
  { label: 'Curve', tour: 'curve' },
  { label: 'Ask', tour: 'ask' },
  { label: 'Defense', tour: 'defense' },
  { label: 'Log', tour: 'log' },
  { label: 'Export', tour: 'export' },
];

export default function Header({
  theme,
  onToggleTheme,
  guided,
  onToggleGuided,
  onUpload,
  onNav,
}: {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  guided: boolean;
  onToggleGuided: () => void;
  onUpload: () => void;
  onNav: (tour: string) => void;
}) {
  // Scroll-spy: highlight the section crossing the viewport middle. Re-observes
  // when guided/full re-mounts sections. Click sets it immediately (no wait).
  const [active, setActive] = useState<string>('score');
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('[data-tour]'));
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.getAttribute('data-tour') ?? '');
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [guided]);

  const go = (tour: string) => {
    setActive(tour);
    onNav(tour);
  };

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--canvas) 82%, transparent)' }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 sm:px-6">
        {/* identity */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: 'var(--accent-soft)', border: '1px solid var(--border-strong)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v18M12 3l7 4.5M12 3L5 7.5M12 21l7-4.5M12 21l-7-4.5M5 7.5v9M19 7.5v9"
                stroke="var(--accent)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="2.4" fill="var(--accent)" />
            </svg>
          </div>
          <span className="font-display text-[15px] font-bold tracking-tight">TradeMirror</span>
          <span
            className="font-num hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:inline"
            style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
          >
            BITGET S2 · T3
          </span>
        </div>

        {/* section nav */}
        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Desk sections">
          {NAV.map((n) => {
            const isActive = active === n.tour;
            return (
              <button
                key={n.tour}
                onClick={() => go(n.tour)}
                aria-current={isActive ? 'true' : undefined}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-white/[0.05]"
                style={isActive ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { color: 'var(--ink-2)' }}
              >
                {n.label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1 lg:hidden" />

        {/* actions */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="font-num hidden items-center gap-0.5 rounded-xl p-1 text-[11px] font-semibold md:flex"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            title={guided ? 'Guided view: the 60-second story only' : 'Full desk: every forensic widget'}
          >
            <button
              onClick={() => guided || onToggleGuided()}
              className="rounded-lg px-2.5 py-1.5"
              style={guided ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { color: 'var(--ink-3)' }}
            >
              Guided
            </button>
            <button
              onClick={() => guided && onToggleGuided()}
              className="rounded-lg px-2.5 py-1.5"
              style={!guided ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { color: 'var(--ink-3)' }}
            >
              Full desk
            </button>
          </div>
          <button
            onClick={onToggleTheme}
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
            title={theme === 'dark' ? 'Switch to Executive Paper (light)' : 'Switch to Nocturne Terminal (dark)'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
              </svg>
            )}
          </button>
          <button
            onClick={onUpload}
            className="rounded-xl px-3 py-2 text-[12px] font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--accent)', color: '#04121a' }}
            title="Drop a Bitget UTA v3 CSV / JSON export"
          >
            ↑ <span className="hidden md:inline">Upload UTA v3</span><span className="md:hidden">Upload</span>
          </button>
        </div>
      </div>

      {/* mobile section nav — horizontal strip, same spy state */}
      <nav className="border-t lg:hidden" style={{ borderColor: 'var(--border)' }} aria-label="Desk sections">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1.5">
          {NAV.map((n) => {
            const isActive = active === n.tour;
            return (
              <button
                key={n.tour}
                onClick={() => go(n.tour)}
                aria-current={isActive ? 'true' : undefined}
                className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1 text-[12px] font-semibold transition-colors"
                style={isActive ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { color: 'var(--ink-2)' }}
              >
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
