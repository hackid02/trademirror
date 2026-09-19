'use client';

import { useMemo } from 'react';
import type { BitgetTradeLog, LeakFlag } from '@/lib/types';
import { computeLeakHeatmap, DOW_LABELS } from '@/lib/analysis';
import { fmtUsd } from '@/lib/engine';
import { Card, SectionTitle } from './ui';

export interface SessionCell {
  dow: number;
  hour: number;
}

/** Thin data must look thin (TradeZella rule): cells under this many trades render pale + hatched. */
const THIN_TRADES = 3;

/** Standard futures/FX UTC session partition — background washes behind the leak signal. */
const SESSIONS = [
  { id: 'ASIA', label: 'ASIA', range: '21–07Z', color: 'var(--accent)' },
  { id: 'LDN', label: 'LDN', range: '07–12Z', color: 'var(--alpha)' },
  { id: 'OVL', label: 'LDN·NY', range: '12–16Z', color: 'var(--warn)' },
  { id: 'NY', label: 'NY', range: '16–21Z', color: '#f472b6' },
] as const;

function sessionFor(hour: number): (typeof SESSIONS)[number] {
  if (hour >= 21 || hour < 7) return SESSIONS[0];
  if (hour < 12) return SESSIONS[1];
  if (hour < 16) return SESSIONS[2];
  return SESSIONS[3];
}

function leakBg(leak: number, max: number, trades: number): string {
  if (trades === 0) return 'transparent';
  if (leak <= 0) return 'var(--alpha-soft)';
  const t = Math.min(1, leak / Math.max(max, 1e-9));
  // thin cells: pale by construction so one big winner can't glow
  const a = trades < THIN_TRADES ? 0.1 + t * 0.3 : 0.12 + t * 0.88;
  return `color-mix(in srgb, var(--risk) ${Math.round(a * 100)}%, transparent)`;
}

const HATCH = 'repeating-linear-gradient(45deg, transparent 0 3px, rgba(140,140,140,0.4) 3px 4px)';

function cellBackground(leak: number, max: number, trades: number, hour: number): string {
  const sess = sessionFor(hour);
  const wash = `linear-gradient(color-mix(in srgb, ${sess.color} 9%, transparent), color-mix(in srgb, ${sess.color} 9%, transparent))`;
  if (trades === 0) return wash;
  const sig = `linear-gradient(${leakBg(leak, max, trades)}, ${leakBg(leak, max, trades)})`;
  return trades < THIN_TRADES ? `${HATCH}, ${sig}, ${wash}` : `${sig}, ${wash}`;
}

export default function LeakHeatmap({
  trades,
  flags,
  selected,
  onCellClick,
}: {
  trades: BitgetTradeLog[];
  flags: LeakFlag[];
  selected?: SessionCell | null;
  onCellClick?: (cell: SessionCell) => void;
}) {
  const heat = useMemo(() => computeLeakHeatmap(trades, flags), [trades, flags]);
  const weekendShare = heat.totalLeak > 0 ? heat.weekendLeak / heat.totalLeak : 0;

  return (
    <Card className="flex h-full flex-col p-5" hover>
      <SectionTitle
        eyebrow="Session attribution · UTC"
        title="When the leak happens"
        right={
          <span
            className="font-num rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{
              color: weekendShare > 0.3 ? 'var(--risk)' : 'var(--alpha)',
              background: weekendShare > 0.3 ? 'var(--risk-soft)' : 'var(--alpha-soft)',
            }}
          >
            Sat+Sun = {(weekendShare * 100).toFixed(0)}% of leak
          </span>
        }
      />

      {/* 7 × 24 grid — fits the column on desktop, scrolls inside itself on phones.
          600px floor keeps cells ≥22px so they stay tappable. */}
      <div className="scroll-x -mx-1 px-1">
        <div className="min-w-[600px] select-none">
          <div className="grid" style={{ gridTemplateColumns: '28px repeat(24, 1fr)', gap: 2 }}>
            <div />
            {[0, 6, 12, 18].map((h) => (
              <div key={h} className="font-num text-[9px]" style={{ color: 'var(--ink-3)', gridColumn: `${h + 2} / span 6` }}>
                {String(h).padStart(2, '0')}Z
              </div>
            ))}
            {heat.cells.map((c) => {
              const isSel = selected?.dow === c.dow && selected?.hour === c.hour;
              const isWorst = heat.worstCell === c;
              const sess = sessionFor(c.hour);
              return (
                <div key={`${c.dow}-${c.hour}`} style={{ display: 'contents' }}>
                  {c.hour === 0 && (
                    <div className="font-num self-center text-[10px] font-semibold" style={{ color: c.dow >= 5 ? 'var(--risk)' : 'var(--ink-3)' }}>
                      {DOW_LABELS[c.dow]}
                    </div>
                  )}
                  <div
                    role="button"
                    tabIndex={c.trades > 0 ? 0 : -1}
                    title={`${DOW_LABELS[c.dow]} ${String(c.hour).padStart(2, '0')}:00Z · ${sess.label} session — ${c.trades} trades · leak ${fmtUsd(-c.leak)} · net ${fmtUsd(c.pnl, true)}${c.trades > 0 && c.trades < THIN_TRADES ? ' · thin data' : ''}${c.trades > 0 ? ' — click to filter log' : ''}`}
                    onClick={() => c.trades > 0 && onCellClick?.({ dow: c.dow, hour: c.hour })}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && c.trades > 0) {
                        e.preventDefault();
                        onCellClick?.({ dow: c.dow, hour: c.hour });
                      }
                    }}
                    className={c.trades > 0 ? 'heatcell' : ''}
                    style={{
                      height: 20,
                      borderRadius: 5,
                      background: cellBackground(c.leak, heat.maxLeak, c.trades, c.hour),
                      border: c.trades === 0 ? '1px solid var(--border)' : '1px solid transparent',
                      outline: isSel ? '2px solid var(--accent)' : isWorst ? '1.5px solid var(--risk)' : undefined,
                      outlineOffset: 1,
                      cursor: c.trades > 0 ? 'pointer' : 'default',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* legend: intensity scale + thin-data key + session washes */}
      <div className="font-num mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px]" style={{ color: 'var(--ink-3)' }}>
        <span className="flex items-center gap-1.5" title="Cell intensity = attributed leak, relative to the worst cell">
          less
          <span
            className="inline-block h-2 w-14 rounded-full"
            style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--risk) 12%, transparent), var(--risk))' }}
          />
          more
        </span>
        <span className="flex items-center gap-1.5" title={`Hatched cells have under ${THIN_TRADES} trades — thin data, read with care`}>
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: HATCH, border: '1px solid var(--border-strong)' }} />
          thin (&lt;{THIN_TRADES})
        </span>
        <span className="flex items-center gap-2">
          {SESSIONS.map((s) => (
            <span key={s.id} className="flex items-center gap-1 font-semibold" title={`${s.label} session · ${s.range} UTC`}>
              <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </span>
      </div>

      {/* weekday PnL bars */}
      <div className="font-num mt-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--ink-3)' }}>
        Net PnL by weekday
      </div>
      <div className="mt-1.5 flex items-end gap-1.5" style={{ height: 64 }}>
        {heat.dowPnl.map((pnl, dd) => {
          const maxAbs = Math.max(1e-9, ...heat.dowPnl.map((v) => Math.abs(v)));
          const h = Math.max(6, (Math.abs(pnl) / maxAbs) * 52);
          const up = pnl >= 0;
          return (
            <div key={dd} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${DOW_LABELS[dd]}: ${fmtUsd(pnl, true)} net · ${fmtUsd(-heat.dowLeak[dd])} leak`}>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: h,
                  background: up ? 'var(--alpha)' : 'var(--risk)',
                  opacity: heat.dowLeak[dd] > 0 ? 0.95 : 0.45,
                }}
              />
              <span className="text-[9px] font-bold" style={{ color: dd >= 5 ? 'var(--risk)' : 'var(--ink-3)' }}>
                {DOW_LABELS[dd][0]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        {heat.worstCell ? (
          <>
            Worst cell:{' '}
            <button
              onClick={() => onCellClick?.({ dow: heat.worstCell!.dow, hour: heat.worstCell!.hour })}
              className="font-bold underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: 'var(--risk)' }}
              title="Filter the forensic log to this session"
            >
              {DOW_LABELS[heat.worstCell.dow]} {String(heat.worstCell.hour).padStart(2, '0')}:00Z · {fmtUsd(-heat.worstCell.leak)}
            </button>{' '}
            across {heat.worstCell.trades} trades. Click any traded cell to filter the forensic log ↓
          </>
        ) : (
          <>No session-concentrated leak — flow is clean across the week.</>
        )}
      </p>
    </Card>
  );
}
