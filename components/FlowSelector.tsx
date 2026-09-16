'use client';

import { fmtUsd } from '@/lib/engine';

export interface FlowTab {
  id: string;
  name: string;
  netPnl: number;
  score: number;
  grade: string;
  leak: number;
  totalTrades: number;
}

function Dial({ score }: { score: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const col =
    score >= 80 ? 'var(--alpha)' : score >= 55 ? 'var(--accent)' : score >= 40 ? 'var(--warn)' : 'var(--risk)';
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden className="shrink-0">
      <circle cx="23" cy="23" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4.5" />
      <circle
        cx="23"
        cy="23"
        r={r}
        fill="none"
        stroke={col}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
        transform="rotate(-90 23 23)"
      />
      <text
        x="23"
        y="23"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="700"
        fill="var(--ink)"
        fontFamily="var(--font-jbmono), monospace"
      >
        {score}
      </text>
    </svg>
  );
}

export default function FlowSelector({
  tabs,
  activeId,
  onSelect,
  hasCustom,
  customName,
  customCount,
  onClearCustom,
  onUpload,
  onTemplate,
}: {
  tabs: FlowTab[];
  activeId: string;
  onSelect: (id: string) => void;
  hasCustom: boolean;
  customName: string;
  customCount: number;
  onClearCustom: () => void;
  onUpload: () => void;
  onTemplate: () => void;
}) {
  return (
    <section aria-label="Trade flow selector">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-num text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ink-3)' }}>
          Trade flow · select account
        </span>
        <span className="font-num hidden text-[11px] sm:block" style={{ color: 'var(--ink-3)' }}>
          seeded UTA v3 · zero setup
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tabs.map((t) => {
          const active = t.id === activeId && !hasCustom;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              title={`Load ${t.name} — score ${t.score}, leak ${fmtUsd(-t.leak)}`}
              className="flex items-center gap-3 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
              style={
                active
                  ? { background: 'var(--surface)', border: '1px solid var(--accent)', boxShadow: 'var(--glow)' }
                  : { background: 'var(--surface)', border: '1px solid var(--border)' }
              }
            >
              <Dial score={t.score} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold">{t.name}</span>
                  {active && (
                    <span className="font-num shrink-0 text-[9px] font-bold tracking-wide" style={{ color: 'var(--accent)' }}>
                      ● LIVE
                    </span>
                  )}
                </span>
                <span className="font-num mt-0.5 block text-[15px] font-bold" style={{ color: t.netPnl >= 0 ? 'var(--alpha)' : 'var(--risk)' }}>
                  {fmtUsd(t.netPnl, true)}
                </span>
                <span className="font-num mt-0.5 block truncate text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {t.grade} · {t.totalTrades} trades
                </span>
                <span className="font-num block truncate text-[11px] font-semibold" style={{ color: 'var(--risk)' }}>
                  {fmtUsd(-t.leak)} leak
                </span>
              </span>
            </button>
          );
        })}

        {/* your own flow */}
        <div
          className="flex items-center gap-3 rounded-2xl border-dashed p-4"
          style={{
            background: hasCustom ? 'var(--surface)' : 'transparent',
            border: `1px dashed ${hasCustom ? 'var(--accent)' : 'var(--border-strong)'}`,
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[13px] font-bold">
              <span className="truncate">{hasCustom ? `📄 ${customName}` : '＋ Your flow'}</span>
              {hasCustom && (
                <span className="font-num shrink-0 text-[9px] font-bold tracking-wide" style={{ color: 'var(--accent)' }}>
                  ● LIVE
                </span>
              )}
            </span>
            <span className="font-num mt-0.5 block text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {hasCustom ? `${customCount} trades ingested` : 'Drop a Bitget UTA v3 export'}
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <button
                onClick={onUpload}
                className="font-num rounded-lg px-2.5 py-1 text-[11px] font-bold"
                style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
              >
                ↑ Upload
              </button>
              <button
                onClick={onTemplate}
                className="font-num rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
                title="Download CSV template"
              >
                Template
              </button>
              {hasCustom && (
                <button
                  onClick={onClearCustom}
                  className="font-num text-[11px] underline underline-offset-2"
                  style={{ color: 'var(--accent)' }}
                >
                  presets
                </button>
              )}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
