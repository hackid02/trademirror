'use client';

import { useMemo, useState } from 'react';
import type { LeakTag, TradeMetrics } from '@/lib/types';
import { fmtDur, fmtUsd } from '@/lib/engine';
import { useCountUp } from './motion';
import { Card, SectionTitle, Stat } from './ui';

export interface SparkSeries {
  equity: number[];
  winRate: number[];
  cumLeak: number[];
}

const MIX_COLOR: Record<LeakTag, string> = {
  WEEKEND_SPREAD: 'var(--risk)',
  REVENGE_TILT: 'var(--warn)',
  PREMATURE_EXIT: 'var(--accent)',
  LOSS_AVERSION: 'var(--accent)',
  EXHAUSTION_CLUSTER: '#f472b6',
};

const TAG_PHRASE: Record<LeakTag, string> = {
  WEEKEND_SPREAD: 'Weekend spreads',
  REVENGE_TILT: 'Revenge tilt',
  PREMATURE_EXIT: 'Early profit clips',
  LOSS_AVERSION: 'Nursed losers',
  EXHAUSTION_CLUSTER: 'Off-hours clusters',
};

/** Mirrors gradeFor() in lib/engine.ts — ascending thresholds. */
const GRADE_STEPS: Array<{ min: number; grade: string }> = [
  { min: 50, grade: 'D' },
  { min: 55, grade: 'C−' },
  { min: 60, grade: 'C' },
  { min: 70, grade: 'C+' },
  { min: 80, grade: 'B' },
  { min: 90, grade: 'A−' },
  { min: 93, grade: 'A' },
  { min: 97, grade: 'A+' },
];

function nextGrade(score: number): { pts: number; grade: string } | null {
  const nx = GRADE_STEPS.find((s) => score < s.min);
  return nx ? { pts: Math.ceil(nx.min - score), grade: nx.grade } : null;
}

function band(score: number): 'alpha' | 'accent' | 'warn' | 'risk' {
  if (score >= 88) return 'alpha';
  if (score >= 70) return 'accent';
  if (score >= 55) return 'warn';
  return 'risk';
}

function toneStroke(tone: 'alpha' | 'accent' | 'warn' | 'risk'): string {
  return tone === 'alpha'
    ? 'var(--alpha)'
    : tone === 'accent'
      ? 'var(--accent)'
      : tone === 'warn'
        ? 'var(--warn)'
        : 'var(--risk)';
}

function Gauge({ score, grade }: { score: number; grade: string }) {
  const animated = useCountUp(score, 1100);
  const R = 62;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(100, animated)) / 100;
  const stroke = toneStroke(band(score));
  const ticks = useMemo(() => Array.from({ length: 48 }, (_, i) => (i / 48) * Math.PI * 2), []);
  return (
    <div
      className="relative h-[132px] w-[132px] shrink-0"
      role="img"
      aria-label={`Behavioral score ${score} out of 100, grade ${grade}`}
    >
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <title>{`Score ${score} out of 100 · grade ${grade}`}</title>
        {ticks.map((a, i) => {
          const major = i % 4 === 0;
          const r1 = major ? 70 : 72;
          const r2 = 75;
          // Round trig output: Math.cos/sin can differ 1 ULP between server and
          // browser libm, which breaks hydration on raw float attributes.
          const f3 = (n: number): number => Math.round(n * 1000) / 1000;
          return (
            <line
              key={i}
              x1={f3(80 + r1 * Math.cos(a))}
              y1={f3(80 + r1 * Math.sin(a))}
              x2={f3(80 + r2 * Math.cos(a))}
              y2={f3(80 + r2 * Math.sin(a))}
              stroke={frac * 48 >= i ? stroke : 'var(--surface-3)'}
              strokeWidth={major ? 2.4 : 1.4}
              strokeLinecap="round"
              opacity={frac * 48 >= i ? 0.9 : 1}
            />
          );
        })}
        <g transform="rotate(-90 80 80)">
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="9.5" />
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke={stroke}
            strokeWidth="9.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            className="gauge-arc"
            style={{ filter: `drop-shadow(0 0 10px color-mix(in srgb, ${stroke} 55%, transparent))` }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-num text-[34px] font-bold leading-none tracking-tight" style={{ color: 'var(--ink)' }}>
            {Math.round(animated)}
          </div>
          <div className="font-num mt-1 text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
            / 100 · {grade}
          </div>
        </div>
      </div>
    </div>
  );
}

/** FTMO-style objective ladder: engine grade thresholds + live position + distance to next tier. */
function GradeLadder({ score }: { score: number }) {
  const nx = nextGrade(score);
  const stroke = toneStroke(band(score));
  return (
    <div role="img" aria-label={nx ? `${nx.pts} points to grade ${nx.grade}` : 'Top grade tier reached'}>
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--surface-3)' }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, score)}%`, background: stroke }} />
        {GRADE_STEPS.map((s) => (
          <div
            key={s.min}
            title={`${s.grade} · ${s.min}+`}
            className="absolute top-[-2px] h-[10px] w-px"
            style={{ left: `${s.min}%`, background: 'var(--ink-3)', opacity: 0.55 }}
          />
        ))}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: `${Math.min(100, score)}%`, borderColor: 'var(--surface-1)', background: stroke }}
        />
      </div>
      <div className="font-num mt-1 flex items-center justify-between text-[10px]" style={{ color: 'var(--ink-3)' }}>
        <span className="font-semibold">F</span>
        <span>{nx ? `${nx.pts} pts to ${nx.grade}` : 'Top tier — defend it'}</span>
        <span className="font-semibold">A+</span>
      </div>
    </div>
  );
}

/**
 * Leak donut, engineered like a trading-desk instrument, not clip-art:
 * sweep draw-in on flow change, rounded hairline-separated segments, soft depth,
 * hover cross-highlight between ring + ledger, live center readout, click-through to receipts.
 */
function LeakDonut({
  segs,
  total,
  onTagSelect,
}: {
  segs: Array<{ tag: LeakTag; dollarCost: number; pct: number }>;
  total: number;
  onTagSelect?: (tag: LeakTag) => void;
}) {
  const animated = useCountUp(total, 1000);
  const frac = total > 0 ? Math.max(0, Math.min(1, animated / total)) : 0;
  const [hover, setHover] = useState<LeakTag | null>(null);
  const R = 46;
  const C = 2 * Math.PI * R;
  const GAP = 3;
  const arcs: Array<{ tag: LeakTag; dollarCost: number; pct: number; start: number }> = [];
  let acc = 0;
  for (const s of segs) {
    arcs.push({ ...s, start: acc });
    acc += s.pct / 100;
  }
  const active = hover ? arcs.find((a) => a.tag === hover) ?? null : null;

  const jumpToLog = (tag: LeakTag) => {
    if (onTagSelect) {
      onTagSelect(tag); // page owns filter + guided-unfold + scroll
    } else {
      document.querySelector('[data-tour="log"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
      <div
        className="relative h-[132px] w-[132px] shrink-0"
        role="img"
        aria-label={
          active
            ? `${TAG_PHRASE[active.tag]} leak ${fmtUsd(-active.dollarCost)}, ${active.pct.toFixed(0)} percent of total`
            : `Total estimated leak ${fmtUsd(-total)} across ${segs.length} bias groups. Hover a segment for detail, click to filter the log.`
        }
      >
        <svg viewBox="0 0 112 112" className="h-full w-full" style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))' }}>
          <circle cx="56" cy="56" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
          <g transform="rotate(-90 56 56)">
            {arcs.map((s) => (
              <circle
                key={s.tag}
                cx="56"
                cy="56"
                r={R}
                fill="none"
                stroke={MIX_COLOR[s.tag]}
                strokeWidth={hover === s.tag ? 15 : 12}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, (s.pct / 100) * C * frac - GAP)} ${C}`}
                strokeDashoffset={-s.start * C * frac}
                opacity={hover !== null && hover !== s.tag ? 0.3 : 1}
                style={{ transition: 'stroke-width .18s ease, opacity .18s ease', cursor: 'pointer' }}
                onMouseEnter={() => setHover(s.tag)}
                onMouseLeave={() => setHover(null)}
                onClick={() => jumpToLog(s.tag)}
              >
                <title>{`${TAG_PHRASE[s.tag]} · ${fmtUsd(-s.dollarCost)} (${s.pct.toFixed(0)}%) — click to filter log`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="px-6">
            <div
              className="font-num text-[15px] font-bold leading-none tracking-tight tabular-nums"
              style={{ color: active ? MIX_COLOR[active.tag] : 'var(--ink)' }}
            >
              {active ? fmtUsd(-active.dollarCost) : fmtUsd(-animated)}
            </div>
            <div
              className="font-num mt-1 truncate text-[8.5px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              {active ? `${active.pct.toFixed(0)}% · ${TAG_PHRASE[active.tag]}` : 'total leak'}
            </div>
          </div>
        </div>
      </div>
      <div className="min-w-0 w-full flex-1">
        {arcs.map((s) => (
          <button
            key={s.tag}
            type="button"
            onClick={() => jumpToLog(s.tag)}
            onMouseEnter={() => setHover(s.tag)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(s.tag)}
            onBlur={() => setHover(null)}
            title={`${TAG_PHRASE[s.tag]} — filter the forensic log to this bias`}
            className="font-num flex w-full items-baseline gap-2 border-b py-[6px] text-left text-[11px] last:border-0"
            style={{
              borderColor: 'var(--border)',
              background: hover === s.tag ? 'var(--surface-2)' : 'transparent',
              opacity: hover !== null && hover !== s.tag ? 0.45 : 1,
              transition: 'background .15s ease, opacity .15s ease',
              cursor: 'pointer',
              borderRadius: 6,
              paddingLeft: 6,
              paddingRight: 6,
              marginLeft: -6,
              marginRight: -6,
            }}
          >
            <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: MIX_COLOR[s.tag] }} />
            <span className="truncate font-semibold" style={{ color: 'var(--ink-2)' }}>
              {s.tag}
            </span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
              {fmtUsd(-s.dollarCost)}
            </span>
            <span className="w-9 shrink-0 text-right tabular-nums" style={{ color: 'var(--ink-3)' }}>
              {s.pct.toFixed(0)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Scorecard({
  metrics,
  personaName,
  sparks,
  groups,
  onTagSelect,
}: {
  metrics: TradeMetrics;
  personaName: string;
  sparks: SparkSeries;
  groups: Array<{ tag: LeakTag; dollarCost: number }>;
  onTagSelect?: (tag: LeakTag) => void;
}) {
  const m = metrics;
  const net = useCountUp(m.netPnl, 1000);
  const leak = useCountUp(m.totalLeakUsd, 1000);
  const winRate = useCountUp(m.winRate * 100, 1000);

  const mix = useMemo(() => {
    const total = groups.reduce((s, g) => s + g.dollarCost, 0);
    if (total <= 0) return null;
    const segs = [...groups]
      .filter((g) => g.dollarCost > 0)
      .sort((a, b) => b.dollarCost - a.dollarCost)
      .map((g) => ({ ...g, pct: (g.dollarCost / total) * 100 }));
    return { segs, total, top: segs[0] };
  }, [groups]);

  const tilted = m.dispositionRatio < 0.25;

  return (
    <Card className="h-full p-5" hover>
      <SectionTitle
        eyebrow="Behavioral alpha scorecard"
        title={m.archetype}
        right={
          <span
            className="font-num inline-flex max-w-[180px] items-center gap-1 truncate rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ border: '1px solid var(--border)', color: 'var(--ink-3)' }}
            title={`Active flow: ${personaName}`}
          >
            ◈ <span className="truncate">{personaName}</span>
          </span>
        }
      />

      {/* verdict hero: gauge + plain-English callout + objective ladder */}
      <div className="mt-3 flex items-center gap-4">
        <Gauge score={m.score} grade={m.grade} />
        <div className="min-w-0 flex-1">
          {mix && (
            <p className="text-[13px] leading-snug" style={{ color: 'var(--ink-2)' }}>
              {TAG_PHRASE[mix.top.tag]} ate{' '}
              <b className="font-num tabular-nums" style={{ color: 'var(--risk)' }}>
                {fmtUsd(-mix.top.dollarCost)}
              </b>{' '}
              — {mix.top.pct.toFixed(0)}% of the bleed.
            </p>
          )}
          <div className="mt-3">
            <GradeLadder score={m.score} />
          </div>
        </div>
      </div>

      {/* leak mix: instrument-grade donut + ledger */}
      {mix ? (
        <div className="mt-4">
          <div
            className="font-num mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--ink-3)' }}
          >
            <span>Leak mix</span>
            <span>
              {mix.segs.length} biases · {m.leakPctOfVolumeBps.toFixed(0)} bps of vol
            </span>
          </div>
          <LeakDonut segs={mix.segs} total={mix.total} onTagSelect={onTagSelect} />
        </div>
      ) : (
        <div
          className="font-num mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold"
          style={{ border: '1px solid var(--border)', color: 'var(--alpha)' }}
        >
          <span aria-hidden="true">✓</span> No behavioral leaks detected — clean audit.
        </div>
      )}

      {/* journal-standard stat grid */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Net PnL" value={fmtUsd(net, true)} tone={m.netPnl >= 0 ? 'alpha' : 'risk'} sub={`${m.totalTrades} trades`} spark={sparks.equity} />
        <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} sub={`${m.wins}W / ${m.losses}L`} spark={sparks.winRate} />
        <Stat label="Est. leak" value={fmtUsd(-leak)} tone="risk" sub={`${m.leakPctOfVolumeBps.toFixed(0)} bps of vol`} spark={sparks.cumLeak} />
        <Stat label="Volume" value={fmtUsd(m.volume)} tone="dim" sub={`fees ${fmtUsd(m.totalFees)}`} />
        <Stat
          label="Avg win hold"
          value={fmtDur(m.avgWinHoldSec)}
          sub={`loss ${fmtDur(m.avgLossHoldSec)}${tilted ? ' · nurses losers' : ''}`}
          tone={tilted ? 'warn' : 'ink'}
        />
        <Stat
          label="Sharpe"
          value={m.sharpe.toFixed(2)}
          sub={`PF ${Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '∞'}`}
          tone={m.sharpe >= 1 ? 'alpha' : m.sharpe < 0 ? 'risk' : 'ink'}
        />
      </div>
    </Card>
  );
}
