// ─── TradeMirror · Live Market Strip (/api/tickers) ───────────────────────────
// Keyless public data: Bitget spot last-price tape + Fear & Greed index.
// Cached server-side; degrades to a clearly-labeled simulated snapshot so the
// desk always feels alive (client random-walks between refreshes either way).

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'RNVDAUSDT', 'RTSLAUSDT', 'RAAPLUSDT'];

// Plausible bases used only when the upstream is unreachable (labeled simulated).
const SIM_BASE: Record<string, { price: number; chg: number }> = {
  BTCUSDT: { price: 112400, chg: 1.8 },
  ETHUSDT: { price: 3840, chg: 2.4 },
  SOLUSDT: { price: 178.5, chg: -1.2 },
  RNVDAUSDT: { price: 186.4, chg: 0.9 },
  RTSLAUSDT: { price: 251.2, chg: -0.6 },
  RAAPLUSDT: { price: 232.8, chg: 0.4 },
};

export interface TapeTicker {
  symbol: string;
  short: string;
  price: number;
  chg24: number;
  live: boolean;
}

export interface TickersResponse {
  tickers: TapeTicker[];
  fearGreed: { value: number; label: string; live: boolean };
  live: boolean;
  ts: number;
}

let cache: { ts: number; data: TickersResponse } | null = null;
const CACHE_MS = 45_000;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

function short(sym: string): string {
  return sym.replace(/USDT$/, '');
}

export async function GET(): Promise<NextResponse<TickersResponse>> {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  const tickers: TapeTicker[] = [];
  let bitgetOk = false;

  try {
    const res = await fetch('https://api.bitget.com/api/v2/spot/market/tickers', {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
      const rows = Array.isArray(json.data) ? json.data : [];
      const bySym = new Map(rows.map((r) => [String(r.symbol ?? '').toUpperCase(), r]));
      for (const sym of SYMBOLS) {
        const r = bySym.get(sym);
        const price = r ? (num(r.close) ?? num(r.lastPr) ?? num(r.last)) : null;
        const chg = r
          ? (num(r.priceChangePercent) ?? num(r.change24h) ?? num(r.change) ?? num(r.chgUtc) ?? 0)
          : null;
        if (price !== null && price > 0) {
          bitgetOk = true;
          // Bitget returns 24h change as a ratio (0.0094 ≈ +0.94%) — normalize to percent.
          const raw = chg ?? 0;
          const chgPct = Math.abs(raw) < 2 ? raw * 100 : raw;
          tickers.push({ symbol: sym, short: short(sym), price, chg24: Math.round(chgPct * 100) / 100, live: true });
        } else {
          const s = SIM_BASE[sym];
          tickers.push({ symbol: sym, short: short(sym), price: s.price, chg24: s.chg, live: false });
        }
      }
    }
  } catch {
    // fall through to simulated
  }

  if (tickers.length === 0) {
    for (const sym of SYMBOLS) {
      const s = SIM_BASE[sym];
      tickers.push({ symbol: sym, short: short(sym), price: s.price, chg24: s.chg, live: false });
    }
  }

  let fearGreed = { value: 55, label: 'Neutral', live: false };
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ value?: string; value_classification?: string }> };
      const row = json.data?.[0];
      const v = row ? num(row.value) : null;
      if (v !== null) {
        fearGreed = { value: Math.round(v), label: row?.value_classification ?? 'Neutral', live: true };
      }
    }
  } catch {
    // keep simulated neutral
  }

  const data: TickersResponse = { tickers, fearGreed, live: bitgetOk, ts: Date.now() };
  cache = { ts: Date.now(), data };
  return NextResponse.json(data);
}
