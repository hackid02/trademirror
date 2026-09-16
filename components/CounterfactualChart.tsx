'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import type { BitgetTradeLog, CurvePoint, LeakFlag, LeakTag } from '@/lib/types';
import { fmtUsd } from '@/lib/engine';
import { getNyseSession } from '@/lib/analysis';
import { Card, SectionTitle } from './ui';

const W = 640;
const H = 230;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 26;

const TAG_DOT: Record<LeakTag, string> = {
  WEEKEND_SPREAD: 'var(--risk)',
  REVENGE_TILT: 'var(--warn)',
  PREMATURE_EXIT: 'var(--accent)',
  LOSS_AVERSION: 'var(--accent)',
  EXHAUSTION_CLUSTER: '#f472b6',
};

function buildPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function CounterfactualChart({
  curve,
  netPnl,
  cleanPnl,
  trades,
  flagsByOrder,
  onMarkerClick,
}: {
  curve: CurvePoint[];
  netPnl: number;
  cleanPnl: number;
  trades?: BitgetTradeLog[];
  flagsByOrder?: Map<string, LeakFlag[]>;
  onMarkerClick?: (orderId: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    if (curve.length === 0) {
      return { actualPath: '', cleanPath: '', areaPath: '', gapPath: '', zeroY: H / 2, actual: [], clean: [], min: 0, max: 0, x: () => 0 };
    }
    const vals = curve.flatMap((p) => [p.actual, p.clean]);
    let min = Math.min(...vals, 0);
    let max = Math.max(...vals, 0);
    if (max - min < 1) {
      max += 50;
      min -= 50;
    }
    const pad = (max - min) * 0.08;
    max += pad;
    min -= pad;
    const x = (i: number) => PAD_L + (i / Math.max(1, curve.length - 1)) * (W - PAD_L - PAD_R);
    const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);
    const actual = curve.map((p, i) => ({ x: x(i), y: y(p.actual) }));
    const clean = curve.map((p, i) => ({ x: x(i), y: y(p.clean) }));
    const actualD = buildPath(actual);
    const cleanD = buildPath(clean);
    const area = `${cleanD} L ${clean[clean.length - 1].x.toFixed(1)} ${y(0).toFixed(1)} L ${clean[0].x.toFixed(1)} ${y(0).toFixed(1)} Z`;
    // Recoverable gap: clean forward, then actual reversed — exact region between the smoothed paths
    const revD = buildPath([...actual].reverse()).replace(/^M\s*[\d.-]+\s+[\d.-]+/, '');
    const gapPath =
      actual.length > 1
        ? `${cleanD} L ${actual[actual.length - 1].x.toFixed(1)} ${actual[actual.length - 1].y.toFixed(1)}${revD} Z`
        : '';
    return { actualPath: actualD, cleanPath: cleanD, areaPath: area, gapPath, zeroY: y(0), actual, clean, min, max, x };
  }, [curve]);

  // NYSE-closed session bands behind the curves (spread-vacuum regime)
  const bands = useMemo(() => {
    if (!trades || curve.length < 2) return [];
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
    const n = Math.min(sorted.length, curve.length);
    const step = (W - PAD_L - PAD_R) / Math.max(1, curve.length - 1);
    const out: Array<{ x0: number; x1: number }> = [];
    let s: number | null = null;
    for (let i = 0; i < n; i++) {
      const closed = !getNyseSession(sorted[i].timestamp).open;
      if (closed && s === null) s = i;
      if ((!closed || i === n - 1) && s !== null) {
        const e = !closed ? i - 1 : i;
        if (e >= s) out.push({ x0: geo.x(s) - step / 2, x1: geo.x(e) + step / 2 });
        s = null;
      }
    }
    return out;
  }, [trades, curve.length, geo]);

  // Flagged-trade markers on the actual curve
  const markers = useMemo(() => {
    if (!trades || !flagsByOrder || geo.actual.length === 0) return [];
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
    const out: Array<{ i: number; x: number; y: number; orderId: string; tag: LeakTag; leak: number; symbol: string }> = [];
    sorted.forEach((t, i) => {
      const fl = flagsByOrder.get(t.orderId);
      if (!fl || fl.length === 0 || !geo.actual[i]) return;
      const top = [...fl].sort((a, b) => b.dollarCost - a.dollarCost)[0];
      const leak = fl.reduce((s, f) => s + f.dollarCost, 0);
      out.push({ i, x: geo.actual[i].x, y: geo.actual[i].y, orderId: t.orderId, tag: top.tag, leak, symbol: t.symbol });
    });
    return out;
  }, [trades, flagsByOrder, geo.actual]);

  // Per-tag biggest receipt (powers the legend jumps)
  const tagTops = useMemo(() => {
    const m = new Map<LeakTag, { orderId: string; leak: number }>();
    for (const mk of markers) {
      const cur = m.get(mk.tag);
      if (!cur || mk.leak > cur.leak) m.set(mk.tag, { orderId: mk.orderId, leak: mk.leak });
    }
    return [...m.entries()];
  }, [markers]);

  // Underwater (drawdown) strip from the actual curve
  const underwater = useMemo(() => {
    if (curve.length < 2) return { path: '', maxDd: 0 };
    let peak = 0;
    let maxDd = 0;
    const dds = curve.map((p) => {
      peak = Math.max(peak, p.actual);
      const dd = peak - p.actual;
      maxDd = Math.max(maxDd, dd);
      return dd;
    });
    const uw = 640;
    const uh = 40;
    const x = (i: number) => (i / (curve.length - 1)) * uw;
    const y = (v: number) => 2 + (maxDd > 0 ? (v / maxDd) * (uh - 6) : 0);
    let d = `M 0 ${y(dds[0]).toFixed(1)}`;
    dds.forEach((v, i) => {
      if (i > 0) d += ` L ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    });
    return { path: `${d} L ${uw} ${uh} L 0 ${uh} Z`, maxDd };
  }, [curve]);

  // X ticks: 5 evenly spaced date gridlines (deduped for tiny flows)
  const xTicks = useMemo(() => {
    if (curve.length < 2) return [];
    const idx = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (curve.length - 1))))];
    return idx.map((i) => ({ i, x: geo.x(i), label: curve[i]?.label ?? '' }));
  }, [curve, geo]);

  const recovered = cleanPnl - netPnl;
  const gid = `tm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const animKey = `${curve.length}-${cleanPnl.toFixed(0)}`;

  // TradingView-style endpoint tags — nudged apart when the curves converge
  const lastA = geo.actual[geo.actual.length - 1] ?? null;
  const lastC = geo.clean[geo.clean.length - 1] ?? null;
  let pillA = lastA?.y ?? 0;
  let pillC = lastC?.y ?? 0;
  if (lastA && lastC && Math.abs(pillA - pillC) < 20) {
    const push = (20 - Math.abs(pillA - pillC)) / 2;
    pillC = Math.max(PAD_T + 9, pillC - push);
    pillA = Math.min(H - PAD_B - 9, pillA + push);
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el || curve.length === 0) return;
    const r = el.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((fx - PAD_L) / (W - PAD_L - PAD_R)) * (curve.length - 1));
    setHover(Math.max(0, Math.min(curve.length - 1, i)));
  };

  const hp = hover !== null ? curve[hover] : null;

  return (
    <Card className="flex h-full flex-col p-5" hover>
      <SectionTitle
        eyebrow="Counterfactual twin · rule-validated"
        title="Actual vs behavior-filtered PnL"
        right={
          <span
            className="font-num rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: recovered >= 0 ? 'var(--alpha)' : 'var(--risk)', background: recovered >= 0 ? 'var(--alpha-soft)' : 'var(--risk-soft)' }}
          >
            {recovered >= 0 ? '+' : ''}
            {fmtUsd(recovered)} recoverable
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl px-3 py-2" style={{ background: 'var(--risk-soft)', border: '1px solid var(--border)' }}>
          <div className="font-num text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--risk)' }}>
            ● Actual realized
          </div>
          <div className="font-num text-xl font-bold" style={{ color: 'var(--risk)' }}>
            {fmtUsd(netPnl, true)}
          </div>
        </div>
        <div className="rounded-xl px-3 py-2" style={{ background: 'var(--alpha-soft)', border: '1px solid var(--border)' }}>
          <div className="font-num text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--alpha)' }}>
            ● Clean filtered
          </div>
          <div className="font-num text-xl font-bold" style={{ color: 'var(--alpha)' }}>
            {fmtUsd(cleanPnl, true)}
          </div>
        </div>
      </div>

      {tagTops.length > 0 && (
        <div className="font-num mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
          {tagTops.map(([tag, t]) => (
            <button
              key={tag}
              onClick={() => onMarkerClick?.(t.orderId)}
              className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
              title={`Jump to biggest ${tag} receipt (${t.orderId} · ${fmtUsd(-t.leak)})`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: TAG_DOT[tag] }} />
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="relative mt-2.5 flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full cursor-crosshair"
          role="img"
          aria-label="Counterfactual PnL chart: actual versus clean-filtered equity with the recoverable gap shaded"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--alpha)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--alpha)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${gid}-c`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--alpha)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--alpha)" />
            </linearGradient>
            <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--warn)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="var(--warn)" stopOpacity="0.10" />
            </linearGradient>
          </defs>
          {bands.map((b, i) => (
            <rect
              key={i}
              x={b.x0}
              y={PAD_T}
              width={Math.max(2, b.x1 - b.x0)}
              height={H - PAD_T - PAD_B}
              fill="var(--risk)"
              opacity="0.055"
            >
              <title>NYSE closed — spread-vacuum regime</title>
            </rect>
          ))}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={PAD_T + f * (H - PAD_T - PAD_B)}
              y2={PAD_T + f * (H - PAD_T - PAD_B)}
              stroke="var(--grid-line)"
              strokeWidth="1"
            />
          ))}
          <line x1={PAD_L} x2={W - PAD_R} y1={geo.zeroY} y2={geo.zeroY} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="4 4" />
          <path d={geo.areaPath} fill={`url(#${gid}-a)`} />
          {geo.gapPath && <path d={geo.gapPath} fill={`url(#${gid}-g)`} />}
          <path key={`c-${animKey}`} d={geo.cleanPath} fill="none" stroke={`url(#${gid}-c)`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw-in" style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--alpha) 45%, transparent))' }} />
          <path key={`a-${animKey}`} d={geo.actualPath} fill="none" stroke="var(--risk)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" pathLength={1} className="draw-in" />

          {/* flagged-trade markers */}
          {markers.map((mk) => (
            <g key={mk.orderId} opacity="0.92">
              <title>{`${mk.orderId} · ${mk.symbol} · ${mk.tag} · leak ${fmtUsd(-mk.leak)} — click for receipt`}</title>
              <circle
                cx={mk.x}
                cy={mk.y}
                r={hover === mk.i ? 5.5 : 3.6}
                fill={TAG_DOT[mk.tag]}
                stroke="var(--surface)"
                strokeWidth="1.6"
                style={{ cursor: onMarkerClick ? 'pointer' : 'default' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkerClick?.(mk.orderId);
                }}
              />
            </g>
          ))}

          {/* crosshair */}
          {hover !== null && geo.actual[hover] && (
            <g>
              <line x1={geo.actual[hover].x} x2={geo.actual[hover].x} y1={PAD_T} y2={H - PAD_B} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={geo.actual[hover].x} cy={geo.actual[hover].y} r="4" fill="var(--risk)" stroke="var(--surface)" strokeWidth="2" />
              <circle cx={geo.clean[hover].x} cy={geo.clean[hover].y} r="4" fill="var(--alpha)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}

          {/* date gridlines + labels */}
          {xTicks.map((t, k) => (
            <g key={t.i}>
              <line x1={t.x} x2={t.x} y1={PAD_T} y2={H - PAD_B} stroke="var(--grid-line)" strokeWidth="1" strokeDasharray="2 4" opacity="0.7" />
              <text
                x={k === 0 ? PAD_L : k === xTicks.length - 1 ? W - PAD_R : t.x}
                y={H - 8}
                fill="var(--ink-3)"
                fontSize="10"
                fontFamily="monospace"
                textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
              >
                {t.label}
              </text>
            </g>
          ))}
          <text x={PAD_L} y={PAD_T + 2} fill="var(--ink-3)" fontSize="10" fontFamily="monospace">
            {fmtUsd(geo.max)}
          </text>
          <text x={PAD_L} y={geo.zeroY - 4} fill="var(--ink-3)" fontSize="10" fontFamily="monospace">
            0
          </text>
          <text x={PAD_L} y={H - PAD_B - 4} fill="var(--ink-3)" fontSize="10" fontFamily="monospace">
            {fmtUsd(geo.min)}
          </text>
        </svg>

        {/* TradingView-style endpoint value tags */}
        {lastA && lastC && (
          <>
            <div
              className="font-num absolute px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
              style={{
                right: 0,
                top: `${(pillC / H) * 100}%`,
                transform: 'translateY(-50%)',
                background: 'var(--alpha)',
                color: '#fff',
                borderRadius: 6,
                boxShadow: 'var(--card-shadow)',
                whiteSpace: 'nowrap',
              }}
              title={`Final clean-filtered: ${fmtUsd(cleanPnl, true)}`}
            >
              {fmtUsd(cleanPnl, true)}
            </div>
            <div
              className="font-num absolute px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
              style={{
                right: 0,
                top: `${(pillA / H) * 100}%`,
                transform: 'translateY(-50%)',
                background: 'var(--risk)',
                color: '#fff',
                borderRadius: 6,
                boxShadow: 'var(--card-shadow)',
                whiteSpace: 'nowrap',
              }}
              title={`Final actual: ${fmtUsd(netPnl, true)}`}
            >
              {fmtUsd(netPnl, true)}
            </div>
          </>
        )}

        {/* hover readout */}
        {hp && hover !== null && (
          <div
            className="font-num pointer-events-none absolute top-0 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug"
            style={{
              left: `${(geo.actual[hover].x / W) * 100}%`,
              transform: geo.actual[hover].x > W * 0.62 ? 'translate(-108%, 0)' : 'translate(8%, 0)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--card-shadow)',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ color: 'var(--ink-3)' }}>#{hover + 1} · {hp.label}Z</div>
            <div><span style={{ color: 'var(--risk)' }}>● {fmtUsd(hp.actual, true)}</span>{'  '}<span style={{ color: 'var(--alpha)' }}>● {fmtUsd(hp.clean, true)}</span></div>
            <div><span style={{ color: 'var(--warn)' }}>Δ {fmtUsd(hp.clean - hp.actual, true)} leak-to-date</span></div>
          </div>
        )}
      </div>

      {/* underwater strip */}
      <div className="mt-2">
        <div className="font-num flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
          <span>Underwater · drawdown depth</span>
          <span style={{ color: 'var(--risk)' }}>max {fmtUsd(-underwater.maxDd)}</span>
        </div>
        <svg viewBox="0 0 640 40" className="mt-1 h-9 w-full" aria-hidden>
          <path d={underwater.path} fill="var(--risk-soft)" stroke="var(--risk)" strokeWidth="1.2" opacity="0.9" />
        </svg>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        Dots mark flagged executions — click one for the receipt. Shaded bands = NYSE closed. Amber fill = the recoverable gap.
      </p>
    </Card>
  );
}
