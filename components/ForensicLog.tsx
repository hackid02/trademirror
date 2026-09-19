'use client';

import { useMemo, useState } from 'react';
import type { BitgetTradeLog, LeakFlag, LeakTag, QwenAudit } from '@/lib/types';
import { cappedFlagCost, fmtDur, fmtUsd, nyseSessionLabel } from '@/lib/engine';
import { DOW_LABELS, flagsByTrade, leakCostsByTrade, mapRuleToEngine } from '@/lib/analysis';
import { Card, SectionTitle, TagChip } from './ui';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z`;
}

export interface SessionFilter {
  dow: number;
  hour: number;
}

const PAGE = 60;
const EXPANDED_CAP = 500; // "show all" still caps DOM nodes on whale-size logs

export default function ForensicLog({
  trades,
  flags,
  highlightOrderId,
  sessionFilter,
  onClearFilter,
  tagFilter,
  onTagSelect,
  audit,
}: {
  trades: BitgetTradeLog[];
  flags: LeakFlag[];
  highlightOrderId?: string | null;
  sessionFilter?: SessionFilter | null;
  onClearFilter?: () => void;
  tagFilter?: LeakTag | null;
  onTagSelect?: (tag: LeakTag | null) => void;
  audit?: QwenAudit | null;
}) {
  const [biasOnly, setBiasOnly] = useState(true);
  const [sortMode, setSortMode] = useState<'time' | 'leak'>('time');
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Object-identity joins: correct under duplicate orderIds (partial fills).
  const byTrade = useMemo(() => flagsByTrade(trades, flags), [trades, flags]);
  const leakByTrade = useMemo(() => leakCostsByTrade(trades, flags), [trades, flags]);

  const base = useMemo(() => {
    let sorted = [...trades].sort((a, b) => b.timestamp - a.timestamp);
    if (sessionFilter) {
      sorted = sorted.filter((t) => {
        const d = new Date(t.timestamp);
        return (d.getUTCDay() + 6) % 7 === sessionFilter.dow && d.getUTCHours() === sessionFilter.hour;
      });
    }
    return biasOnly ? sorted.filter((t) => byTrade.has(t)) : sorted;
  }, [trades, biasOnly, byTrade, sessionFilter]);

  // Tag counts over the session/bias-filtered set (powers the chip row)
  const tagCounts = useMemo(() => {
    const m = new Map<LeakTag, number>();
    for (const t of base) {
      for (const f of byTrade.get(t) ?? []) {
        m.set(f.tag, (m.get(f.tag) ?? 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base, byTrade]);

  const rows = useMemo(() => {
    const filtered = tagFilter ? base.filter((t) => (byTrade.get(t) ?? []).some((f) => f.tag === tagFilter)) : base;
    if (sortMode === 'leak') {
      return [...filtered].sort((a, b) => (leakByTrade.get(b) ?? 0) - (leakByTrade.get(a) ?? 0));
    }
    return filtered;
  }, [base, tagFilter, sortMode, byTrade, leakByTrade]);

  // engine rule → Qwen guardrail id (powers the per-flag fix links)
  const links = useMemo(() => {
    const m = new Map<string, string>();
    if (!audit) return m;
    for (const r of audit.defenseRules) {
      const eid = mapRuleToEngine(r.ruleId, r.directive);
      if (eid && !m.has(eid)) m.set(eid, r.ruleId);
    }
    return m;
  }, [audit]);

  const jumpToDefense = (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector('[data-tour="defense"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const copyId = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopiedId(orderId);
      window.setTimeout(() => setCopiedId((c) => (c === orderId ? null : c)), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const flaggedCount = byTrade.size;
  const visible = expanded ? rows.slice(0, EXPANDED_CAP) : rows.slice(0, PAGE);

  return (
    <Card className="h-full p-5" hover>
      <SectionTitle
        eyebrow="Forensic audit log · anomaly replay"
        title="Tick-by-tick inspection"
        right={
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setBiasOnly(true)}
              className="font-num rounded-lg px-2.5 py-1 text-[11px] font-semibold"
              style={
                biasOnly
                  ? { background: 'var(--risk-soft)', color: 'var(--risk)' }
                  : { color: 'var(--ink-3)' }
              }
            >
              Bias only ({flaggedCount})
            </button>
            <button
              onClick={() => setBiasOnly(false)}
              className="font-num rounded-lg px-2.5 py-1 text-[11px] font-semibold"
              style={!biasOnly ? { background: 'var(--surface-3)', color: 'var(--ink)' } : { color: 'var(--ink-3)' }}
            >
              All trades ({trades.length})
            </button>
          </div>
        }
      />

      {/* tag drill-down + sort toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => onTagSelect?.(null)}
          title="Show all tags"
          className="font-num rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-transform hover:scale-[1.03]"
          style={
            !tagFilter
              ? { background: 'var(--accent)', color: '#04121a' }
              : { border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }
          }
        >
          All
        </button>
        {tagCounts.map(([tag, n]) => {
          const active = tagFilter === tag;
          return (
            <button
              key={tag}
              onClick={() => onTagSelect?.(active ? null : tag)}
              title={active ? `Clear ${tag} filter` : `Filter log to ${tag}`}
              className="font-num rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-transform hover:scale-[1.03]"
              style={
                active
                  ? { background: 'var(--accent)', color: '#04121a' }
                  : { border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }
              }
            >
              {tag} · {n}
            </button>
          );
        })}
        <span className="font-num ml-auto flex items-center gap-1 rounded-lg p-0.5" style={{ border: '1px solid var(--border)' }}>
          <button
            onClick={() => setSortMode('time')}
            title="Newest first"
            className="rounded-md px-2 py-0.5 text-[10.5px] font-bold"
            style={sortMode === 'time' ? { background: 'var(--surface-3)', color: 'var(--ink)' } : { color: 'var(--ink-3)' }}
          >
            Time ↓
          </button>
          <button
            onClick={() => setSortMode('leak')}
            title="Biggest leak first"
            className="rounded-md px-2 py-0.5 text-[10.5px] font-bold"
            style={sortMode === 'leak' ? { background: 'var(--risk-soft)', color: 'var(--risk)' } : { color: 'var(--ink-3)' }}
          >
            Leak ↓
          </button>
        </span>
      </div>

      {sessionFilter && (
        <button
          onClick={onClearFilter}
          className="font-num mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-[12px] font-semibold"
          style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
          title="Clear session filter"
        >
          <span>
            ◉ Session filter: {DOW_LABELS[sessionFilter.dow]} {String(sessionFilter.hour).padStart(2, '0')}:00Z · {rows.length} trade{rows.length === 1 ? '' : 's'}
          </span>
          <span>✕ clear</span>
        </button>
      )}

      <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
        {rows.length === 0 && (
          <div className="rounded-xl px-4 py-8 text-center text-[13px]" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            No trades under this filter — try “All trades” or clear the session/tag filter.
          </div>
        )}
        {visible.map((t, vi) => {
          const tFlags = byTrade.get(t) ?? [];
          const leak = leakByTrade.get(t) ?? 0;
          const pnlTone = t.realizedPnl > 0 ? 'var(--alpha)' : t.realizedPnl < 0 ? 'var(--risk)' : 'var(--ink-3)';
          const hl = highlightOrderId === t.orderId;
          return (
            <details
              key={`${t.orderId}#${vi}`}
              id={`log-${t.orderId}-${vi}`}
              data-log={t.orderId}
              open={hl ? true : undefined}
              className="group scroll-mt-40 rounded-xl"
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${hl ? 'var(--accent)' : 'var(--border)'}`,
                boxShadow: hl ? 'var(--glow)' : undefined,
                animation: hl ? 'ping-soft 1.4s ease-out 2' : undefined,
              }}
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="font-num text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {fmtTime(t.timestamp)}
                </span>
                <span className="font-num text-[12px] font-bold">{t.symbol}</span>
                <span
                  className="font-num rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={
                    t.side === 'buy'
                      ? { color: 'var(--alpha)', background: 'var(--alpha-soft)' }
                      : { color: 'var(--risk)', background: 'var(--risk-soft)' }
                  }
                >
                  {t.side.toUpperCase()}
                </span>
                <span className="font-num text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {t.orderType || '—'}
                </span>
                <span className="font-num ml-auto text-[13px] font-bold" style={{ color: pnlTone }}>
                  {fmtUsd(t.realizedPnl, true)}
                </span>
                {tFlags.length > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <TagChip tag={tFlags[0].tag} />
                    {tFlags.length > 1 && (
                      <span className="flex items-center gap-1.5">
                        <span className="font-num text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                          +{tFlags.length - 1}
                        </span>
                        <span
                          className="font-num rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                          title="Independent detectors converged on this trade — confluence, not a single signal"
                        >
                          ◈ {tFlags.length} agree
                        </span>
                      </span>
                    )}
                    <span className="font-num text-[11px] font-bold" style={{ color: 'var(--risk)' }}>
                      {fmtUsd(-leak)}
                    </span>
                  </span>
                ) : (
                  <span className="font-num text-[10px] font-semibold" style={{ color: 'var(--alpha)' }}>
                    ✓ CLEAN
                  </span>
                )}
              </summary>
              <div className="border-t px-3 py-3" style={{ borderColor: 'var(--border)' }}>
                {/* Etherscan grammar: status first, then the record */}
                <div className="flex flex-wrap items-center gap-2">
                  {tFlags.length > 0 ? (
                    <span
                      className="font-num rounded-md px-2 py-1 text-[10.5px] font-bold"
                      style={{ color: 'var(--risk)', background: 'var(--risk-soft)' }}
                    >
                      ◉ FLAGGED · {tFlags.length} bias{tFlags.length === 1 ? '' : 'es'}{leak > 0 ? ` · ${fmtUsd(-leak)} leak` : ' · $0 realized — process foul'}
                    </span>
                  ) : (
                    <span
                      className="font-num rounded-md px-2 py-1 text-[10.5px] font-bold"
                      style={{ color: 'var(--alpha)', background: 'var(--alpha-soft)' }}
                    >
                      ✓ CLEAN · no behavioral leak
                    </span>
                  )}
                  <span className="font-num text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    #{t.orderId}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      void copyId(t.orderId);
                    }}
                    title="Copy order ID"
                    className="font-num rounded px-1 text-[11px] font-bold transition-opacity hover:opacity-70"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {copiedId === t.orderId ? '✓' : '⧉'}
                  </button>
                </div>
                <div className="font-num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4" style={{ color: 'var(--ink-2)' }}>
                  <span>fill <b>{t.fillPrice.toLocaleString('en-US')}</b></span>
                  <span>size <b>{t.size}</b></span>
                  <span>notional <b>{fmtUsd(t.notionalUsd)}</b></span>
                  <span>fee <b>{fmtUsd(t.fee)}</b></span>
                  <span>hold <b>{fmtDur(t.holdDurationSeconds)}</b></span>
                  <span>session <b>{nyseSessionLabel(t.timestamp)}</b></span>
                  <span>exit <b>{t.closeReason ?? '—'}</b></span>
                </div>
                {tFlags.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {tFlags.map((f, i) => {
                      const ruleId = links.get(f.ruleId);
                      return (
                        <div key={i} className="rounded-lg p-2.5" style={{ background: 'var(--risk-soft)', border: '1px solid var(--border)' }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <TagChip tag={f.tag} />
                            {ruleId && (
                              <button
                                type="button"
                                onClick={jumpToDefense}
                                title={`Jump to ${ruleId} — the guardrail that fixes this`}
                                className="font-num rounded px-1.5 py-0.5 text-[10px] font-bold transition-opacity hover:opacity-70"
                                style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                              >
                                ◈ {ruleId}
                              </button>
                            )}
                            <span className="font-num min-w-0 flex-1 truncate text-[10px]" style={{ color: 'var(--ink-3)' }} title={`${f.ruleId} · ${f.triggerDetail}`}>
                              {f.ruleId} · {f.triggerDetail}
                            </span>
                            <span className="font-num text-[12px] font-bold" style={{ color: 'var(--risk)' }}>
                              {fmtUsd(-cappedFlagCost(f, t))}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                            {f.narrative}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>
          );
        })}
        {!expanded && rows.length > PAGE && (
          <button
            onClick={() => setExpanded(true)}
            className="font-num rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-transform hover:scale-[1.01]"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
          >
            Show all {Math.min(rows.length, EXPANDED_CAP)} trades · showing {PAGE}
          </button>
        )}
        {expanded && rows.length > EXPANDED_CAP && (
          <div className="font-num rounded-xl px-3 py-2 text-center text-[11px]" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            Showing first {EXPANDED_CAP} of {rows.length} — narrow the filters to inspect the rest.
          </div>
        )}
      </div>
    </Card>
  );
}
