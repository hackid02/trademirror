// ─── TradeMirror · Deterministic Heuristic Engine ─────────────────────────────
// Pure TypeScript, zero-latency behavioral leak math. No LLM, no network.
// Rules implement §3.2 of the Master Spec.

import type {
  AuditComputation,
  BitgetTradeLog,
  CurvePoint,
  LeakFlag,
  LeakGroup,
  LeakTag,
  TradeMetrics,
} from './types';

// ─── NYSE session clock ─────────────────────────────────────────────────────
// Weekend window: Friday 20:00 UTC → Sunday 23:00 UTC (rToken spread vacuum).
// Overnight window: weekdays 20:00 UTC → 13:30 UTC next day.
export function isNyseClosed(ts: number): boolean {
  const d = new Date(ts);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 5 && mins >= 20 * 60) return true; // Friday after close
  if (day === 6) return true; // all Saturday
  if (day === 0 && mins < 23 * 60) return true; // Sunday before 23:00
  if (day >= 1 && day <= 5) {
    if (mins >= 20 * 60 || mins < 13 * 60 + 30) return true; // overnight
  }
  return false;
}

export function nyseSessionLabel(ts: number): string {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 5 && mins >= 20 * 60) return 'FRI · post-close';
  if (day === 6) return 'SAT · closed';
  if (day === 0 && mins < 23 * 60) return 'SUN · closed';
  if (mins >= 20 * 60 || mins < 13 * 60 + 30) return 'overnight · closed';
  return 'NYSE open';
}

// ─── Rule 1: Weekend rToken Liquidity Trap ──────────────────────────────────
const WEEKEND_SLIPPAGE_RATE = 0.005; // 0.50% illiquidity penalty

function ruleWeekendRToken(t: BitgetTradeLog, i: number): LeakFlag | null {
  if (t.assetType !== 'rToken') return null;
  if (t.orderType !== 'market') return null;
  if (!isNyseClosed(t.timestamp)) return null;
  const dollarCost = t.notionalUsd * WEEKEND_SLIPPAGE_RATE;
  return {
    tradeIndex: i,
    orderId: t.orderId,
    tag: 'WEEKEND_SPREAD',
    ruleId: 'LEAK_WEEKEND_RTOKEN',
    dollarCost,
    narrative: `Market ${t.side} on ${t.symbol} while NYSE closed (${nyseSessionLabel(t.timestamp)}) — paid synthetic-book spread vacuum ≈0.50% of notional.`,
    triggerDetail: `rToken+market@${nyseSessionLabel(t.timestamp)} · slip≈$${dollarCost.toFixed(2)}`,
  };
}

// ─── Rule 2: Revenge Velocity & Tilt Sizing ─────────────────────────────────
const REVENGE_WINDOW_SEC = 900; // 15 minutes
const TILT_SIZE_MULT = 1.4; // 1.4× rolling 20-trade average

function rollingAvgNotional(trades: BitgetTradeLog[], i: number): number {
  const start = Math.max(0, i - 20);
  const window = trades.slice(start, i);
  if (window.length === 0) return trades[i].notionalUsd;
  return window.reduce((s, t) => s + t.notionalUsd, 0) / window.length;
}

function ruleRevengeTilt(trades: BitgetTradeLog[], i: number): LeakFlag | null {
  if (i === 0) return null;
  const t = trades[i];
  const prev = trades[i - 1];
  if (!(prev.realizedPnl < 0)) return null;
  const gapSec = (t.timestamp - prev.timestamp) / 1000;
  if (gapSec < 0 || gapSec > REVENGE_WINDOW_SEC) return null;
  const avg = rollingAvgNotional(trades, i);
  if (t.notionalUsd < TILT_SIZE_MULT * avg) return null;
  const dollarCost = t.realizedPnl < 0 ? Math.abs(t.realizedPnl) : 0;
  const mult = (t.notionalUsd / avg).toFixed(2);
  return {
    tradeIndex: i,
    orderId: t.orderId,
    tag: 'REVENGE_TILT',
    ruleId: 'LEAK_REVENGE_TILT',
    dollarCost,
    narrative: `Opened ${Math.round(gapSec / 60)}m after a $${Math.abs(prev.realizedPnl).toFixed(0)} loss at ${mult}× normal size — classic tilt sizing${t.realizedPnl < 0 ? ' that also lost' : ' (survived, but process foul)'}.`,
    triggerDetail: `gap=${Math.round(gapSec)}s ≤900s · size=${mult}× ≥1.4×`,
  };
}

// ─── Rule 3: Asymmetric Disposition Effect ──────────────────────────────────
const DISPOSITION_RATIO_ALERT = 0.25;
const PREMATURE_HOLD_SEC = 1800; // winners clipped under 30 min
const RUNNER_MULT = 1.5; // uncaptured runner potential

function ruleDisposition(
  trades: BitgetTradeLog[],
  i: number,
  ratio: number,
): LeakFlag | null {
  if (ratio >= DISPOSITION_RATIO_ALERT) return null;
  const t = trades[i];
  if (!(t.realizedPnl > 0)) return null;
  const panicked = t.closeReason === 'manual_panic';
  const clipped = t.holdDurationSeconds < PREMATURE_HOLD_SEC && t.orderType === 'market';
  if (!panicked && !clipped) return null;
  const dollarCost = t.realizedPnl * RUNNER_MULT;
  return {
    tradeIndex: i,
    orderId: t.orderId,
    tag: 'PREMATURE_EXIT',
    ruleId: 'LEAK_DISPOSITION_ASYMMETRY',
    dollarCost,
    narrative: `Banked $${t.realizedPnl.toFixed(0)} after ${fmtDur(t.holdDurationSeconds)} while losers are held for hours — disposition asymmetry bleeds ≈1.5× in uncaptured runners.`,
    triggerDetail: `ratio=${ratio.toFixed(2)} <0.25 · winHold=${fmtDur(t.holdDurationSeconds)}`,
  };
}

// ─── Rule 4: High-Frequency Exhaustion Clustering ───────────────────────────
const CLUSTER_WINDOW_MS = 2 * 60 * 60 * 1000;
const CLUSTER_MIN_TRADES = 6;

function ruleExhaustion(trades: BitgetTradeLog[], i: number): LeakFlag | null {
  const t = trades[i];
  const from = t.timestamp - CLUSTER_WINDOW_MS;
  let count = 0;
  let fees = 0;
  let grossWins = 0;
  for (let j = i; j >= 0; j--) {
    const w = trades[j];
    if (w.timestamp < from) break;
    count++;
    fees += w.fee;
    if (w.realizedPnl > 0) grossWins += w.realizedPnl;
  }
  if (count < CLUSTER_MIN_TRADES) return null;
  if (fees <= grossWins) return null; // only when fees eat the window
  const dollarCost = t.fee + Math.max(0, -t.realizedPnl) * 0.25;
  return {
    tradeIndex: i,
    orderId: t.orderId,
    tag: 'EXHAUSTION_CLUSTER',
    ruleId: 'LEAK_EXHAUSTION_CLUSTER',
    dollarCost,
    narrative: `${count} trades in 2h with $${fees.toFixed(0)} fees vs $${grossWins.toFixed(0)} gross wins — off-hours overtrading where the fee meter runs faster than edge.`,
    triggerDetail: `n=${count} ≥6/2h · fees>$${grossWins.toFixed(0)} wins`,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
export function fmtDur(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

export function fmtUsd(n: number, signed = false): string {
  const sign = signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gradeFor(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A−';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C−';
  if (score >= 50) return 'D';
  return 'F';
}

function archetypeFor(m: {
  weekend: number;
  revenge: number;
  premature: number;
  cluster: number;
  score: number;
}): string {
  const contenders: Array<[string, number]> = [
    ['Weekend Liquidity Donor', m.weekend],
    ['Impulsive Tilt Scalper', m.revenge],
    ['Premature Profit Clipper', m.premature],
    ['Off-Hours Overtrader', m.cluster],
  ];
  const top = contenders.sort((a, b) => b[1] - a[1])[0];
  if (m.score >= 88 || top[1] === 0) return 'Institutional Systematic Executor';
  return top[0];
}

// ─── Main entry: run full audit ─────────────────────────────────────────────
export function runAudit(inputTrades: BitgetTradeLog[]): AuditComputation {
  const trades = [...inputTrades].sort((a, b) => a.timestamp - b.timestamp);

  // Base aggregates
  let grossWin = 0;
  let grossLoss = 0;
  let totalFees = 0;
  let volume = 0;
  let wins = 0;
  let losses = 0;
  let winHoldSum = 0;
  let lossHoldSum = 0;
  for (const t of trades) {
    volume += t.notionalUsd;
    totalFees += t.fee;
    if (t.realizedPnl > 0) {
      wins++;
      grossWin += t.realizedPnl;
      winHoldSum += t.holdDurationSeconds;
    } else if (t.realizedPnl < 0) {
      losses++;
      grossLoss += t.realizedPnl;
      lossHoldSum += t.holdDurationSeconds;
    }
  }
  const avgWinHoldSec = wins ? winHoldSum / wins : 0;
  const avgLossHoldSec = losses ? lossHoldSum / losses : 0;
  const dispositionRatio = avgLossHoldSec > 0 ? avgWinHoldSec / avgLossHoldSec : 1;

  // Flags
  const flags: LeakFlag[] = [];
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const f1 = ruleWeekendRToken(t, i);
    if (f1) flags.push(f1);
    const f2 = ruleRevengeTilt(trades, i);
    if (f2) flags.push(f2);
    const f3 = ruleDisposition(trades, i, dispositionRatio);
    if (f3) flags.push(f3);
    const f4 = ruleExhaustion(trades, i);
    if (f4) flags.push(f4);
  }

  const flaggedOrderIds = new Set(flags.map((f) => f.orderId));
  const leakByOrderId = new Map<string, number>();
  for (const f of flags) {
    leakByOrderId.set(f.orderId, (leakByOrderId.get(f.orderId) ?? 0) + f.dollarCost);
  }
  const totalLeakUsd = flags.reduce((s, f) => s + f.dollarCost, 0);

  // Curves: actual net vs behavior-filtered clean
  let actualCum = 0;
  let cleanCum = 0;
  const curve: CurvePoint[] = trades.map((t, i) => {
    const net = t.realizedPnl - t.fee;
    actualCum += net;
    // Clean PnL recovers attributed leak, but never manufactures profit above
    // (loss + fee) for loss-side flags; premature-exit opportunity is additive.
    const orderFlags = flags.filter((f) => f.orderId === t.orderId);
    let recovery = 0;
    for (const f of orderFlags) {
      if (f.tag === 'PREMATURE_EXIT') recovery += f.dollarCost;
      else recovery += Math.min(f.dollarCost, Math.max(0, -t.realizedPnl) + t.fee);
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
  const netPnl = actualCum;
  const cleanPnl = cleanCum;

  // Drawdown on actual curve
  let peak = 0;
  let maxDrawdown = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.actual);
    maxDrawdown = Math.min(maxDrawdown, p.actual - peak);
  }

  // Per-trade Sharpe (annualised-ish scaling)
  const nets = trades.map((t) => t.realizedPnl - t.fee);
  const mean = nets.length ? nets.reduce((s, n) => s + n, 0) / nets.length : 0;
  const variance = nets.length
    ? nets.reduce((s, n) => s + (n - mean) ** 2, 0) / nets.length
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(Math.max(nets.length, 1)) : 0;

  const byTag = (tag: LeakTag) => flags.filter((f) => f.tag === tag);
  const weekend = byTag('WEEKEND_SPREAD');
  const revenge = byTag('REVENGE_TILT');
  const premature = byTag('PREMATURE_EXIT');
  const cluster = byTag('EXHAUSTION_CLUSTER');

  // Behavioral score — penalties calibrated to master-spec bands
  const weekendLeak = weekend.reduce((s, f) => s + f.dollarCost, 0);
  const revengeCount = revenge.length;
  const tiltLeak = revenge.reduce((s, f) => s + f.dollarCost, 0);
  // Cluster flags fire per-trade inside a 2h window — collapse to distinct windows.
  const clusterEvents = cluster.length === 0 ? 0 : Math.ceil(new Set(cluster.map((f) => f.orderId)).size / 6);
  const feeDrag = grossWin > 0 ? totalFees / grossWin : totalFees > 0 ? 1 : 0;
  const dispositionPenalty =
    dispositionRatio < DISPOSITION_RATIO_ALERT
      ? Math.min(14, (DISPOSITION_RATIO_ALERT - dispositionRatio) * 40)
      : 0;
  const score = Math.max(
    5,
    Math.min(
      99,
      Math.round(
        100 -
          Math.min(22, weekendLeak / 150) -
          Math.min(25, revengeCount * 3) -
          Math.min(12, tiltLeak / 350) -
          dispositionPenalty -
          Math.min(15, clusterEvents * 3) -
          Math.min(12, feeDrag * 22),
      ),
    ),
  );

  const metrics: TradeMetrics = {
    totalTrades: trades.length,
    wins,
    losses,
    flats: trades.length - wins - losses,
    winRate: trades.length ? wins / trades.length : 0,
    grossWin,
    grossLoss,
    totalFees,
    netPnl,
    volume,
    avgWin: wins ? grossWin / wins : 0,
    avgLoss: losses ? grossLoss / losses : 0,
    avgWinHoldSec,
    avgLossHoldSec,
    dispositionRatio,
    profitFactor: grossLoss < 0 ? grossWin / Math.abs(grossLoss) : grossWin > 0 ? 99 : 0,
    sharpe,
    maxDrawdown,
    totalLeakUsd,
    cleanPnl,
    leakPctOfVolumeBps: volume > 0 ? (totalLeakUsd / volume) * 10000 : 0,
    score,
    grade: gradeFor(score),
    archetype: archetypeFor({
      weekend: weekendLeak,
      revenge: tiltLeak,
      premature: premature.reduce((s, f) => s + f.dollarCost, 0),
      cluster: cluster.reduce((s, f) => s + f.dollarCost, 0),
      score,
    }),
    revengeCount,
    weekendCount: weekend.length,
    prematureCount: premature.length,
    clusterCount: clusterEvents,
  };

  const groups: LeakGroup[] = (
    [
      {
        tag: 'WEEKEND_SPREAD' as LeakTag,
        ruleId: 'LEAK_WEEKEND_RTOKEN',
        biasName: 'Weekend Spread Vacuum',
        items: weekend,
        rootCause:
          'Market orders on rTokens while NYSE is closed get filled against thin synthetic books with ~50bps of excess spread.',
        counterfactual:
          'Route rToken flow to limit orders inside 13:30–20:00 UTC, or sit out the weekend window entirely.',
      },
      {
        tag: 'REVENGE_TILT' as LeakTag,
        ruleId: 'LEAK_REVENGE_TILT',
        biasName: 'Revenge Tilt Sizing',
        items: revenge,
        rootCause:
          'Loss-triggered urgency: re-entering within 15 minutes at 1.4×+ size turns one red trade into a tilt cascade.',
        counterfactual:
          'Enforce a 30-minute post-loss cooldown and cap post-loss size at 1.1× trailing average.',
      },
      {
        tag: 'PREMATURE_EXIT' as LeakTag,
        ruleId: 'LEAK_DISPOSITION_ASYMMETRY',
        biasName: 'Premature Profit Clipping',
        items: premature,
        rootCause:
          'Winners are clipped in minutes while losers are nursed for hours — loss aversion monetised against you.',
        counterfactual:
          'Hold winners via time-stop + trailing ratchet; cut losers at the pre-defined invalidation, not at hope.',
      },
      {
        tag: 'EXHAUSTION_CLUSTER' as LeakTag,
        ruleId: 'LEAK_EXHAUSTION_CLUSTER',
        biasName: 'Off-Hours Overtrading',
        items: cluster,
        rootCause:
          'Dense scalp clusters in zero-edge windows where cumulative fees outrun gross wins — negative expectancy by construction.',
        counterfactual:
          'Cap off-hours flow at 4 trades per 2h session; kill the session when fee/win ratio crosses 0.6.',
      },
    ]
  )
    .map((g) => ({
      tag: g.tag,
      ruleId: g.ruleId,
      biasName: g.biasName,
      dollarCost: g.items.reduce((s, f) => s + f.dollarCost, 0),
      tradeCount: new Set(g.items.map((f) => f.orderId)).size,
      pctOfLeak: totalLeakUsd > 0 ? g.items.reduce((s, f) => s + f.dollarCost, 0) / totalLeakUsd : 0,
      rootCause: g.rootCause,
      counterfactual: g.counterfactual,
    }))
    .filter((g) => g.tradeCount > 0 && g.dollarCost > 0.01)
    .sort((a, b) => b.dollarCost - a.dollarCost);

  return { metrics, flags, groups, curve, flaggedOrderIds, leakByOrderId };
}
