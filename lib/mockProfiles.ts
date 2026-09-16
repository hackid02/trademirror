// ─── TradeMirror · Seeded Demo Personas ──────────────────────────────────────
// Three pre-baked UTA v3 trade logs so judges can evaluate with zero setup.
// Deterministic (mulberry32) — identical on every load and every machine.

import type { AssetType, BitgetTradeLog, CloseReason, OrderType, Persona, Side } from './types';

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SymbolSpec {
  symbol: string;
  assetType: AssetType;
  refPrice: number;
}

const SYMBOLS: SymbolSpec[] = [
  { symbol: 'rNVDAUSDT', assetType: 'rToken', refPrice: 186.4 },
  { symbol: 'rTSLAUSDT', assetType: 'rToken', refPrice: 251.2 },
  { symbol: 'rAAPLUSDT', assetType: 'rToken', refPrice: 232.8 },
  { symbol: 'BTCUSDT', assetType: 'crypto_perp', refPrice: 112400 },
  { symbol: 'ETHUSDT', assetType: 'crypto_perp', refPrice: 3840 },
];

const FEE_RATE = 0.0005;

function nextWeekdayUtc(fromMs: number, weekday: number, hourUtc: number, minUtc = 0): number {
  const d = new Date(fromMs);
  const cur = d.getUTCDay();
  const delta = (weekday - cur + 7) % 7;
  const candidate = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + delta,
    hourUtc,
    minUtc,
    0,
  );
  if (candidate <= fromMs) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta + 7, hourUtc, minUtc, 0);
  }
  return candidate;
}

interface GenOpts {
  seed: number;
  prefix: string;
  count: number;
  spanDays: number;
  startMs: number;
  winRate: number;
  baseNotionalMin: number;
  baseNotionalMax: number;
  winMin: number;
  winMax: number;
  lossMin: number; // absolute
  lossMax: number; // absolute
  winHoldMinSec: number;
  winHoldMaxSec: number;
  lossHoldMinSec: number;
  lossHoldMaxSec: number;
  rTokenWeight: number; // 0..1
  marketWeight: number; // 0..1
  weekendForceRatio: number; // share of trades pinned to Sat/Sun
  revengeChains: number; // injected tilt sequences
  tiltLossMin?: number; // tilt donation range (default 200–600)
  tiltLossMax?: number;
  clusterBursts: number; // injected 2h overtrade bursts
  nyseOpenOnlyRToken: boolean; // disciplined: rTokens only inside 13:30–20:00 UTC
  weekendSizeMult?: number; // breakout-chasing size-up on weekend rToken flow
}

function generateTrades(o: GenOpts): BitgetTradeLog[] {
  const rnd = mulberry32(o.seed);
  const trades: BitgetTradeLog[] = [];
  const spanMs = o.spanDays * 24 * 3600 * 1000;

  const pickSymbol = (): SymbolSpec => {
    if (rnd() < o.rTokenWeight) {
      const r = SYMBOLS.filter((s) => s.assetType === 'rToken');
      return r[Math.floor(rnd() * r.length)];
    }
    const c = SYMBOLS.filter((s) => s.assetType !== 'rToken');
    return c[Math.floor(rnd() * c.length)];
  };

  const inNyseOpen = (ms: number): boolean => {
    const d = new Date(ms);
    const day = d.getUTCDay();
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (day === 0 || day === 6) return false;
    return mins >= 13 * 60 + 30 && mins < 20 * 60;
  };

  const forceWeekendTs = (base: number): number => {
    // Pin to Saturday or Sunday of the surrounding week, random hour
    const saturday = nextWeekdayUtc(base - 6 * 24 * 3600 * 1000, 6, 0, 0);
    const pickSat = rnd() < 0.6;
    const dayBase = pickSat ? saturday : saturday + 24 * 3600 * 1000;
    const hour = Math.floor(rnd() * 24);
    const min = Math.floor(rnd() * 60);
    const d = new Date(dayBase);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, min, 0);
  };

  const makeTrade = (idx: number, ts: number, force: Partial<BitgetTradeLog> = {}): BitgetTradeLog => {
    const spec = force.symbol
      ? (SYMBOLS.find((s) => s.symbol === force.symbol) ?? pickSymbol())
      : pickSymbol();
    const isWin = rnd() < o.winRate;
    const scaleRef = spec.assetType === 'rToken' ? 1 : 1.35;
    const base = o.baseNotionalMin + rnd() * (o.baseNotionalMax - o.baseNotionalMin);
    const notionalUsd = base * scaleRef * (force.notionalUsd ? force.notionalUsd / base : 1);
    const realizedPnl = isWin
      ? o.winMin + rnd() * (o.winMax - o.winMin)
      : -(o.lossMin + rnd() * (o.lossMax - o.lossMin));
    const holdDurationSeconds = Math.round(
      isWin
        ? o.winHoldMinSec + rnd() * (o.winHoldMaxSec - o.winHoldMinSec)
        : o.lossHoldMinSec + rnd() * (o.lossHoldMaxSec - o.lossHoldMinSec),
    );
    const side: Side = rnd() < 0.5 ? 'buy' : 'sell';
    const orderType: OrderType = rnd() < o.marketWeight ? 'market' : 'limit';
    const fillPrice = spec.refPrice * (1 + (rnd() - 0.5) * 0.04);
    let closeReason: CloseReason;
    if (isWin) {
      closeReason = orderType === 'limit' && rnd() < 0.7 ? 'take_profit' : 'limit_exit';
      if (o.winHoldMaxSec <= 1500 && rnd() < 0.35) closeReason = 'manual_panic';
    } else {
      closeReason = rnd() < 0.5 ? 'manual_panic' : 'stop_loss';
    }
    return {
      orderId: `${o.prefix}-${String(idx).padStart(4, '0')}`,
      symbol: spec.symbol,
      assetType: spec.assetType,
      side,
      orderType,
      fillPrice: Math.round(fillPrice * 100) / 100,
      size: 0, // filled below
      notionalUsd: Math.round(notionalUsd * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      fee: 0, // filled below
      timestamp: ts,
      holdDurationSeconds,
      closeReason,
      ...force,
    } as BitgetTradeLog;
  };

  // Base flow — uniform across the span
  for (let k = 0; k < o.count; k++) {
    let ts = o.startMs + Math.floor((k / o.count) * spanMs + rnd() * (spanMs / o.count));
    if (rnd() < o.weekendForceRatio) ts = forceWeekendTs(ts);
    const t = makeTrade(k + 1, ts, { orderType: undefined as unknown as OrderType });
    // Re-roll order type properly (makeTrade default already applied; force rToken+market on weekends)
    const d = new Date(t.timestamp);
    const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    if (isWeekend && t.assetType === 'rToken' && !o.nyseOpenOnlyRToken && rnd() < 0.85) {
      t.orderType = 'market';
      if (o.weekendSizeMult) t.notionalUsd = Math.round(t.notionalUsd * o.weekendSizeMult * 100) / 100;
    }
    if (o.nyseOpenOnlyRToken && t.assetType === 'rToken' && !inNyseOpen(t.timestamp)) {
      // slide rToken flow into the next NYSE-open window
      let slide = t.timestamp;
      for (let guard = 0; guard < 200 && !inNyseOpen(slide); guard++) slide += 30 * 60 * 1000;
      t.timestamp = slide;
      t.orderType = 'limit';
    }
    trades.push(t);
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);

  // Injected cluster bursts: 6–8 scalps inside ~100 minutes, fee-heavy.
  // Degenerate sizing: big tickets, tiny wins — fees outrun gross wins by design.
  // NOTE: bursts go first so revenge chains (injected after) stay adjacent to losses.
  for (let b = 0; b < o.clusterBursts; b++) {
    const at = Math.floor(rnd() * trades.length);
    const anchorTs = trades[at].timestamp;
    const burstN = 6 + Math.floor(rnd() * 3);
    for (let k = 0; k < burstN; k++) {
      const t = makeTrade(700 + b * 10 + k, anchorTs + k * (12 + Math.floor(rnd() * 8)) * 60 * 1000);
      t.notionalUsd = Math.round((5000 + rnd() * 5000) * 100) / 100;
      t.realizedPnl = Math.round((rnd() < 0.4 ? 2 + rnd() * 7 : -(20 + rnd() * 80)) * 100) / 100;
      t.holdDurationSeconds = 120 + Math.floor(rnd() * 600);
      t.orderType = 'market';
      t.closeReason = 'limit_exit';
      trades.push(t);
    }
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);

  // Injected revenge chains: loss → fast, oversized re-entry (usually another loss).
  // Runs AFTER bursts so tilt stays the immediate next trade after its anchor loss.
  for (let c = 0; c < o.revengeChains; c++) {
    const lossIdx = trades.findIndex(
      (t, i) => i > 2 && t.realizedPnl < 0 && trades[i + 1] && trades[i + 1].timestamp - t.timestamp > 30 * 60 * 1000,
    );
    if (lossIdx < 0) break;
    const anchor = trades[lossIdx];
    const avgRecent =
      trades.slice(Math.max(0, lossIdx - 20), lossIdx).reduce((s, t) => s + t.notionalUsd, 0) /
      Math.max(1, Math.min(20, lossIdx));
    const gapSec = 180 + Math.floor(rnd() * 360); // 3–9 min later
    const tilt = makeTrade(900 + c, anchor.timestamp + gapSec * 1000);
    tilt.notionalUsd = Math.round(avgRecent * (2.2 + rnd() * 1.0) * 100) / 100; // 2.2–3.2× clears 1.4× bar
    tilt.realizedPnl = -((o.tiltLossMin ?? 200) + rnd() * ((o.tiltLossMax ?? 600) - (o.tiltLossMin ?? 200)));
    tilt.holdDurationSeconds = 300 + Math.floor(rnd() * 1500);
    tilt.closeReason = 'manual_panic';
    tilt.orderType = 'market';
    trades.splice(lossIdx + 1, 0, tilt);
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);

  // Finalise derived fields + sequential ids
  trades.forEach((t, i) => {
    t.size = Math.round((t.notionalUsd / t.fillPrice) * 1000000) / 1000000;
    t.fee = Math.round(t.notionalUsd * FEE_RATE * 100) / 100;
    t.orderId = `${o.prefix}-${String(i + 1).padStart(4, '0')}`;
  });

  return trades;
}

const START = Date.UTC(2026, 7, 15, 9, 0, 0); // Aug 15 2026

export function buildPersonas(): Persona[] {
  const chaser = generateTrades({
    seed: 20770,
    prefix: 'TM-WC',
    count: 32,
    spanDays: 21,
    startMs: START,
    winRate: 0.38,
    baseNotionalMin: 2200,
    baseNotionalMax: 8200,
    winMin: 30,
    winMax: 170,
    lossMin: 55,
    lossMax: 220,
    winHoldMinSec: 300,
    winHoldMaxSec: 1200,
    lossHoldMinSec: 3 * 3600,
    lossHoldMaxSec: 9 * 3600,
    rTokenWeight: 0.65,
    marketWeight: 0.7,
    weekendForceRatio: 0.5,
    revengeChains: 4,
    tiltLossMin: 90,
    tiltLossMax: 280,
    clusterBursts: 1,
    nyseOpenOnlyRToken: false,
    weekendSizeMult: 2.4,
  });

  const scalper = generateTrades({
    seed: 90210,
    prefix: 'TM-RS',
    count: 16,
    spanDays: 12,
    startMs: START + 3 * 24 * 3600 * 1000,
    winRate: 0.47,
    baseNotionalMin: 4000,
    baseNotionalMax: 9000,
    winMin: 25,
    winMax: 160,
    lossMin: 70,
    lossMax: 420,
    winHoldMinSec: 240,
    winHoldMaxSec: 1500,
    lossHoldMinSec: 900,
    lossHoldMaxSec: 5400,
    rTokenWeight: 0.3,
    marketWeight: 0.8,
    weekendForceRatio: 0.15,
    revengeChains: 8,
    tiltLossMin: 150,
    tiltLossMax: 450,
    clusterBursts: 2,
    nyseOpenOnlyRToken: false,
  });

  const pro = generateTrades({
    seed: 424242,
    prefix: 'TM-DP',
    count: 54,
    spanDays: 30,
    startMs: START,
    winRate: 0.61,
    baseNotionalMin: 3000,
    baseNotionalMax: 6000,
    winMin: 60,
    winMax: 320,
    lossMin: 40,
    lossMax: 150,
    winHoldMinSec: 2 * 3600,
    winHoldMaxSec: 7 * 3600,
    lossHoldMinSec: 1200,
    lossHoldMaxSec: 3600,
    rTokenWeight: 0.45,
    marketWeight: 0.25,
    weekendForceRatio: 0.0,
    revengeChains: 0,
    clusterBursts: 0,
    nyseOpenOnlyRToken: true,
  });

  return [
    {
      id: 'weekend_rtoken_chaser',
      name: 'Weekend rToken Chaser',
      tagline: 'Chases synthetic breakouts after NYSE close',
      blurb:
        'rToken-heavy flow with weekend market orders, tilt cascades after red closes, and winners clipped in minutes.',
      trades: chaser,
    },
    {
      id: 'revenge_scalper',
      name: 'The Revenge Scalper',
      tagline: 'Sizes up within minutes of every loss',
      blurb:
        'High-velocity futures scalping with 1.6–2.8× tilt re-entries and fee-dense off-hours bursts.',
      trades: scalper,
    },
    {
      id: 'disciplined_pro',
      name: 'Disciplined Pro',
      tagline: 'The control group — systematic executor',
      blurb:
        'Limit-first, NYSE-hours rToken flow with asymmetric holds in the right direction. Near-zero leak surface.',
      trades: pro,
    },
  ];
}
