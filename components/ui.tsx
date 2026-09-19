'use client';

import React, { useCallback } from 'react';
import type { LeakTag } from '@/lib/types';

// ─── Bento card with cursor-following radial highlight ───────────────────────
export function Card({
  className = '',
  children,
  hover = false,
}: {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
}) {
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);
  return (
    <div onMouseMove={onMove} className={`bento spotlight ${hover ? 'bento-hover' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div
          className="font-num text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'var(--ink-3)' }}
        >
          {eyebrow}
        </div>
        <h2 className="mt-1 text-balance text-lg font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'ink',
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ink' | 'alpha' | 'risk' | 'accent' | 'warn' | 'dim';
  spark?: number[];
}) {
  const color =
    tone === 'alpha'
      ? 'var(--alpha)'
      : tone === 'risk'
        ? 'var(--risk)'
        : tone === 'accent'
          ? 'var(--accent)'
          : tone === 'warn'
            ? 'var(--warn)'
            : tone === 'dim'
              ? 'var(--ink-3)'
              : 'var(--ink)';
  const sparkPath = (() => {
    if (!spark || spark.length < 2) return null;
    const w = 120;
    const h = 26;
    const min = Math.min(...spark);
    const max = Math.max(...spark);
    const span = max - min || 1;
    const pts = spark.map((v, i) => {
      const x = (i / (spark.length - 1)) * w;
      const y = 2 + (1 - (v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { line: `M ${pts.join(' L ')}`, area: `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z` };
  })();
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </div>
      <div className="font-num mt-0.5 text-[15px] font-semibold" style={{ color }}>
        {value}
      </div>
      {sparkPath && (
        <svg viewBox="0 0 120 26" className="mt-1 h-[22px] w-full" aria-hidden preserveAspectRatio="none">
          <path d={sparkPath.area} fill={color} opacity="0.12" />
          <path d={sparkPath.line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {sub && (
        <div className="font-num mt-0.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const TAG_STYLE: Record<LeakTag, { fg: string; bg: string }> = {
  WEEKEND_SPREAD: { fg: 'var(--risk)', bg: 'var(--risk-soft)' },
  REVENGE_TILT: { fg: 'var(--warn)', bg: 'var(--warn-soft)' },
  PREMATURE_EXIT: { fg: 'var(--accent)', bg: 'var(--accent-soft)' },
  LOSS_AVERSION: { fg: 'var(--accent)', bg: 'var(--accent-soft)' },
  EXHAUSTION_CLUSTER: { fg: 'var(--risk)', bg: 'var(--risk-soft)' },
};

export function TagChip({ tag }: { tag: LeakTag }) {
  const s = TAG_STYLE[tag];
  return (
    <span
      className="font-num inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
      style={{ color: s.fg, background: s.bg, border: `1px solid ${s.fg}33` }}
    >
      {tag}
    </span>
  );
}

export function SoftBadge({
  children,
  tone = 'accent',
}: {
  children: React.ReactNode;
  tone?: 'accent' | 'alpha' | 'risk' | 'warn' | 'dim';
}) {
  const map = {
    accent: ['var(--accent)', 'var(--accent-soft)'],
    alpha: ['var(--alpha)', 'var(--alpha-soft)'],
    risk: ['var(--risk)', 'var(--risk-soft)'],
    warn: ['var(--warn)', 'var(--warn-soft)'],
    dim: ['var(--ink-2)', 'var(--surface-2)'],
  } as const;
  const [fg, bg] = map[tone];
  return (
    <span
      className="font-num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: fg, background: bg, border: `1px solid ${fg}30` }}
    >
      {children}
    </span>
  );
}

// ─── iOS-style toggle visual (aria-hidden; the parent label/button owns semantics) ─
export function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200"
      style={{ background: on ? 'var(--alpha)' : 'var(--surface-3)', justifyContent: on ? 'flex-end' : 'flex-start' }}
    >
      <span
        className="h-4 w-4 rounded-full"
        style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transition: 'all .18s ease' }}
      />
    </span>
  );
}
