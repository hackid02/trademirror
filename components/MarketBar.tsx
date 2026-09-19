'use client';

// ─── TradeMirror · Live Market Tape ──────────────────────────────────────────
// NYSE session chip + segmented live price tape. One slim row: every ticker in
// its own pill segment. Random-walks between 60s server refreshes; clearly
// labeled SIM when upstream is unreachable.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtCountdown, getNyseSession } from '@/lib/analysis';
import type { TickersResponse } from '@/app/api/tickers/route';

interface TickState {
  price: number;
  dir: 1 | -1 | 0;
}

const SHORT_LABEL: Record<string, string> = {
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'SOL',
  RNVDA: 'rNVDA',
  RTSLA: 'rTSLA',
  RAAPL: 'rAAPL',
};

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  if (p >= 100) return p.toFixed(2);
  return p.toFixed(3);
}

export default function MarketBar() {
  const [now, setNow] = useState(() => Date.now());
  const [feed, setFeed] = useState<TickersResponse | null>(null);
  const [ticks, setTicks] = useState<Record<string, TickState>>({});
  const baseRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  // Server refresh (60s) + local random-walk ticks (2s)
  useEffect(() => {
    let stop = false;
    // Per-symbol liveness mirrored for the tick loop (same closure, no staleness).
    const liveMap: Record<string, boolean> = {};
    const load = async () => {
      try {
        const res = await fetch('/api/tickers', { cache: 'no-store' });
        const data = (await res.json()) as TickersResponse;
        if (stop) return;
        setFeed(data);
        const next: Record<string, TickState> = {};
        for (const t of data.tickers) {
          baseRef.current[t.symbol] = t.price;
          liveMap[t.symbol] = t.live;
          next[t.symbol] = { price: t.price, dir: 0 };
        }
        setTicks(next);
      } catch {
        if (stop) return;
        // Total failure: seed sim bases locally AND publish a feed so the
        // tape renders with SIM badges instead of an empty strip.
        const sim: Record<string, number> = {
          BTCUSDT: 112400, ETHUSDT: 3840, SOLUSDT: 178.5,
          RNVDAUSDT: 186.4, RTSLAUSDT: 251.2, RAAPLUSDT: 232.8,
        };
        baseRef.current = sim;
        for (const s of Object.keys(sim)) liveMap[s] = false;
        const next: Record<string, TickState> = {};
        for (const [s, p] of Object.entries(sim)) next[s] = { price: p, dir: 0 };
        setTicks(next);
        setFeed({
          tickers: Object.entries(sim).map(([symbol, price]) => ({
            symbol,
            short: symbol.replace(/USDT$/, ''),
            price,
            chg24: 0,
            live: false,
          })),
          fearGreed: { value: 50, label: 'Neutral', live: false },
          live: false,
          ts: Date.now(),
        });
      }
    };
    void load();
    const slow = window.setInterval(() => void load(), 60_000);
    const fast = window.setInterval(() => {
      setTicks((prev) => {
        const next: Record<string, TickState> = {};
        for (const [s, cur] of Object.entries(prev)) {
          // Live quotes stay pinned to the server value; only simulated
          // tickers drift — a tape read as "live" must never random-walk.
          if (liveMap[s]) {
            const price = baseRef.current[s] ?? cur.price;
            next[s] = { price, dir: 0 };
            continue;
          }
          const drift = (Math.random() - 0.5) * 0.0012;
          const price = cur.price * (1 + drift);
          next[s] = { price, dir: drift > 0.00006 ? 1 : drift < -0.00006 ? -1 : 0 };
        }
        return next;
      });
    }, 2000);
    return () => {
      stop = true;
      window.clearInterval(slow);
      window.clearInterval(fast);
    };
  }, []);

  const session = useMemo(() => getNyseSession(now), [now]);

  const items = feed?.tickers ?? [];
  const tape = [...items, ...items]; // duplicated for the marquee loop

  return (
    <div className="border-b" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--surface) 72%, transparent)' }}>
      <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6">
        {/* session segment */}
        <div className="font-num flex shrink-0 items-center py-2 pr-3 text-[11px]">
          <span
            className="flex items-center gap-2 rounded-lg px-2.5 py-1"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            title={session.open ? 'US cash market is open' : 'rTokens trading without underlying price discovery'}
            suppressHydrationWarning
          >
            <span
              className="flex items-center gap-1.5 font-semibold"
              style={{ color: session.open ? 'var(--alpha)' : 'var(--risk)' }}
              suppressHydrationWarning
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${session.open ? '' : 'live-dot'}`}
                style={{ background: 'currentColor' }}
                suppressHydrationWarning
              />
              {session.open ? 'NYSE OPEN' : 'NYSE CLOSED'}
            </span>
            <span className="tabular-nums" style={{ color: 'var(--ink-3)' }}>
              <span className="hidden sm:inline" suppressHydrationWarning>{session.nextLabel} </span>
              <span style={{ color: 'var(--ink-2)' }} suppressHydrationWarning>{fmtCountdown(session.nextMs - now)}</span>
            </span>
          </span>
        </div>

        {/* segmented tape */}
        <div className="marquee-mask relative min-w-0 flex-1 overflow-hidden">
          <div className="animate-marquee flex w-max items-center gap-2.5 py-2">
            {tape.map((t, i) => {
              const tick = ticks[t.symbol];
              const price = tick?.price ?? t.price;
              const dir = tick?.dir ?? 0;
              return (
                <span
                  key={`${t.symbol}-${i}`}
                  className="font-num flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px]"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--ink-3)' }}>{SHORT_LABEL[t.short] ?? t.short}</span>
                  <span
                    className={dir === 1 ? 'tick-up' : dir === -1 ? 'tick-down' : ''}
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {fmtPrice(price)}
                  </span>
                  <span className="font-semibold" style={{ color: t.chg24 >= 0 ? 'var(--alpha)' : 'var(--risk)' }}>
                    {t.chg24 >= 0 ? '+' : ''}{t.chg24.toFixed(2)}%
                  </span>
                  {!t.live && (
                    <span className="rounded px-1 text-[9px] font-bold" style={{ color: 'var(--warn)', background: 'var(--warn-soft)' }} title="Upstream unreachable — simulated drift">
                      SIM
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
