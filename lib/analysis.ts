// ─── TradeMirror · What-If + Heatmap + Session Analysis ───────────────────────
// Interactive layer on top of the deterministic engine: rule-toggled
// counterfactual curves, weekday×hour attribution, live NYSE session clock,
// and sparkline series. Pure functions.

import type { BitgetTradeLog, CurvePoint, LeakFlag } from './types';
import { cappedFlagCost } from './engine';

export const ENGINE_RULE_IDS = [
  'LEAK_WEEKEND_RTOKEN',
  'LEAK_REVENGE_TILT',
  'LEAK_DISPOSITION_ASYMMETRY',
  'LEAK_EXHAUSTION_CLUSTER',
] as const;

// Map a defense guardrail (Rule-W01 …) to its deterministic engine rule.
// Matches canonical IDs first, then keyword-falls back on the directive text
// so Qwen paraphrases still wire into the what-if engine.
export function mapRuleToEngine(ruleId: string, directive = ''): string | null {
  const id = (ruleId ?? '').toUpperCase();
  if (id.includes('W01') || id.includes('WEEKEND')) return 'LEAK_WEEKEND_RTOKEN';
  if (id.includes('T02') || id.includes('TILT') || id.includes('REVENGE') || id.includes('COOLDOWN'))
    return 'LEAK_REVENGE_TILT';
  if (id.includes('H03') || id.includes('DISPOSITION') || id.includes('TRAILING') || id.includes('RATCHET'))
    return 'LEAK_DISPOSITION_ASYMMETRY';
  if (id.includes('F04') || id.includes('EXHAUST') || id.includes('CLUSTER') || id.includes('SESSION') || id.includes('GOVERNOR'))
    return 'LEAK_EXHAUSTION_CLUSTER';
  const d = (directive ?? '').toLowerCase();
  if (/weekend|nyse|spread|closed|lockout/.test(d)) return 'LEAK_WEEKEND_RTOKEN';
  if (/tilt|revenge|cooldown|freeze|halt|oversiz/.test(d)) return 'LEAK_REVENGE_TILT';
  if (/winner|trailing|ratchet|time.stop|clip|disposition|hold/.test(d)) return 'LEAK_DISPOSITION_ASYMMETRY';
  if (/cluster|session|off.hour|overtrad|fee/.test(d)) return 'LEAK_EXHAUSTION_CLUSTER';
  return null;
}

// ─── Duplicate-safe flag joins ─────────────────────────────────────────────
// Partial-fill exports reuse orderIds across rows, so flags join by tradeIndex
// (position in the timestamp-sorted array — the engine's identity) and are
// exposed to components keyed by trade OBJECT, which survives any row order.
function sortedTrades(inputTrades: BitgetTradeLog[]): BitgetTradeLog[] {
  return [...inputTrades].sort((a, b) => a.timestamp - b.timestamp);
}

export function flagsByTrade(
  inputTrades: BitgetTradeLog[],
  flags: LeakFlag[],
): Map<BitgetTradeLog, LeakFlag[]> {
  const trades = sortedTrades(inputTrades);
  const m = new Map<BitgetTradeLog, LeakFlag[]>();
  for (const f of flags) {
    const t = trades[f.tradeIndex];
    if (!t) continue;
    const arr = m.get(t) ?? [];
    arr.push(f);
    m.set(t, arr);
  }
  return m;
}

export function leakCostsByTrade(
  inputTrades: BitgetTradeLog[],
  flags: LeakFlag[],
): Map<BitgetTradeLog, number> {
  const trades = sortedTrades(inputTrades);
  const m = new Map<BitgetTradeLog, number>();
  for (const f of flags) {
    const t = trades[f.tradeIndex];
    if (!t) continue;
    m.set(t, (m.get(t) ?? 0) + cappedFlagCost(f, t));
  }
  return m;
}

export interface WhatIfResult {
  curve: CurvePoint[];
  cleanPnl: number;
  recovered: number; // cleanPnl - actualNet
}

// Recompute actual vs clean with ONLY `enabled` engine rules recovering leak.
// Disarming a guardrail visibly drags the clean curve back toward actual.
export function computeCleanCurveWithRules(
  inputTrades: BitgetTradeLog[],
  flags: LeakFlag[],
  enabled: Set<string>,
): WhatIfResult {
  const trades = sortedTrades(inputTrades);
  const byIndex = new Map<number, LeakFlag[]>();
  for (const f of flags) {
    const arr = byIndex.get(f.tradeIndex) ?? [];
    arr.push(f);
    byIndex.set(f.tradeIndex, arr);
  }
  let actualCum = 0;
  let cleanCum = 0;
  const curve: CurvePoint[] = trades.map((t, i) => {
    const net = t.realizedPnl - t.fee;
    actualCum += net;
    let recovery = 0;
    for (const f of byIndex.get(i) ?? []) {
      if (!enabled.has(f.ruleId)) continue;
      recovery += cappedFlagCost(f, t);
    }
    cleanCum += net + recovery;
    return {
      i,
      time: t.timestamp,
      label: new Date(t.timestamp).toISOString().slice(5, 16).replace('T', ' '),
      actual: actualCum,
      clean: cleanCum,
    };
  });
  return { curve, cleanPnl: cleanCum, recovered: cleanCum - actualCum };
}

// ─── Weekday × hour leak heatmap ────────────────────────────────────────────
// Rows: Mon..Sun · Cols: 0..23 UTC
export interface HeatCell {
  dow: number; // 0=Mon … 6=Sun
  hour: number; // 0..23 UTC
  leak: number;
  trades: number;
  pnl: number;
}

export interface HeatmapResult {
  cells: HeatCell[];
  maxLeak: number;
  maxTrades: number;
  totalLeak: number;
  weekendLeak: number; // Sat+Sun share of leak
  weekendTrades: number;
  dowLeak: number[]; // 7 entries Mon..Sun
  dowPnl: number[]; // 7 entries Mon..Sun
  worstCell: HeatCell | null;
}

export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function computeLeakHeatmap(trades: BitgetTradeLog[], flags: LeakFlag[]): HeatmapResult {
  const leakByTrade = leakCostsByTrade(trades, flags);
  const cells: HeatCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ dow, hour, leak: 0, trades: 0, pnl: 0 });
    }
  }
  const at = (dow: number, hour: number) => cells[dow * 24 + hour];
  for (const t of trades) {
    const d = new Date(t.timestamp);
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0
    const c = at(dow, d.getUTCHours());
    c.trades += 1;
    c.pnl += t.realizedPnl - t.fee;
    c.leak += leakByTrade.get(t) ?? 0;
  }
  let maxLeak = 0;
  let maxTrades = 0;
  let totalLeak = 0;
  let weekendLeak = 0;
  let weekendTrades = 0;
  let worstCell: HeatCell | null = null;
  const dowLeak = [0, 0, 0, 0, 0, 0, 0];
  const dowPnl = [0, 0, 0, 0, 0, 0, 0];
  for (const c of cells) {
    maxLeak = Math.max(maxLeak, c.leak);
    maxTrades = Math.max(maxTrades, c.trades);
    totalLeak += c.leak;
    dowLeak[c.dow] += c.leak;
    dowPnl[c.dow] += c.pnl;
    if (c.dow >= 5) {
      weekendLeak += c.leak;
      weekendTrades += c.trades;
    }
    if (c.leak > 0 && (!worstCell || c.leak > worstCell.leak)) worstCell = c;
  }
  return { cells, maxLeak, maxTrades, totalLeak, weekendLeak, weekendTrades, dowLeak, dowPnl, worstCell };
}

// ─── NYSE session clock ────────────────────────────────────────────────────
// Regular cash hours: 13:30–20:00 UTC, Monday–Friday.
export interface NyseSession {
  open: boolean;
  label: string;
  nextLabel: string;
  nextMs: number; // timestamp of next transition
}

export function getNyseSession(nowMs: number): NyseSession {
  const now = new Date(nowMs);
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const inHours = mins >= 13 * 60 + 30 && mins < 20 * 60;

  if (isWeekday && inHours) {
    const close = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20, 0, 0);
    return { open: true, label: 'NYSE OPEN', nextLabel: 'Closes in', nextMs: close };
  }
  // Find next weekday 13:30 UTC strictly after now
  for (let add = 0; add < 8; add++) {
    const cand = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add, 13, 30, 0));
    const wd = cand.getUTCDay();
    if (wd >= 1 && wd <= 5 && cand.getTime() > nowMs) {
      const sameDay = add === 0;
      const tomorrow = add === 1;
      const name = sameDay ? 'today' : tomorrow ? 'tomorrow' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd];
      return { open: false, label: 'NYSE CLOSED', nextLabel: `Opens ${name} in`, nextMs: cand.getTime() };
    }
  }
  return { open: false, label: 'NYSE CLOSED', nextLabel: 'Opens in', nextMs: nowMs };
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const dd = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return dd > 0 ? `${dd}d ${p(hh)}:${p(mm)}:${p(ss)}` : `${p(hh)}:${p(mm)}:${p(ss)}`;
}

// ─── Sparkline series ──────────────────────────────────────────────────────
export interface SparkSeries {
  equity: number[];
  winRate: number[]; // rolling last-10 win %
  cumLeak: number[];
}

function downsample(xs: number[], max = 90): number[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(xs[Math.floor(i * step)]);
  return out;
}

export function computeSparkSeries(
  inputTrades: BitgetTradeLog[],
  curve: CurvePoint[],
  flags: LeakFlag[],
): SparkSeries {
  const trades = sortedTrades(inputTrades);
  const leakByTrade = leakCostsByTrade(trades, flags);
  const equity = downsample(curve.map((p) => p.actual));
  const winRate: number[] = [];
  let cumLeak = 0;
  const cumLeakArr: number[] = [];
  trades.forEach((t, i) => {
    const window = trades.slice(Math.max(0, i - 9), i + 1);
    winRate.push((window.filter((w) => w.realizedPnl > 0).length / window.length) * 100);
    cumLeak += leakByTrade.get(t) ?? 0;
    cumLeakArr.push(cumLeak);
  });
  return { equity, winRate: downsample(winRate), cumLeak: downsample(cumLeakArr) };
}
