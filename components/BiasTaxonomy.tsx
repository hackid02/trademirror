'use client';

import { useMemo } from 'react';
import type { LeakGroup, QwenAudit } from '@/lib/types';
import { mapRuleToEngine } from '@/lib/analysis';
import { fmtUsd } from '@/lib/engine';
import { Card, SectionTitle, Switch, TagChip } from './ui';

export default function BiasTaxonomy({
  groups,
  totalLeak,
  armed,
  onToggle,
  audit,
}: {
  groups: LeakGroup[];
  totalLeak: number;
  armed: string[];
  onToggle: (engineRuleId: string) => void;
  audit: QwenAudit | null;
}) {
  const max = Math.max(1, ...groups.map((g) => g.dollarCost));

  // engine rule → Qwen guardrail id (powers the cross-links to the defense card)
  const links = useMemo(() => {
    const m = new Map<string, string>();
    if (!audit) return m;
    for (const r of audit.defenseRules) {
      const eid = mapRuleToEngine(r.ruleId, r.directive);
      if (eid && !m.has(eid)) m.set(eid, r.ruleId);
    }
    return m;
  }, [audit]);

  const jumpToDefense = () => {
    document.querySelector('[data-tour="defense"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Card className="flex h-full flex-col p-5" hover>
      <SectionTitle
        eyebrow="Bias taxonomy attribution"
        title="Where the dollars bled"
        right={
          <span className="font-num text-[12px] font-semibold" style={{ color: 'var(--ink-3)' }}>
            total {fmtUsd(-totalLeak)}
          </span>
        }
      />
      {groups.length === 0 && (
        <div
          className="rounded-xl px-4 py-8 text-center text-[13px]"
          style={{ background: 'var(--alpha-soft)', color: 'var(--alpha)' }}
        >
          ✓ No behavioral leaks detected. This flow is clean — institutional-grade process control.
        </div>
      )}
      <div className="flex flex-col gap-3">
        {groups.map((g) => {
          const on = armed.includes(g.ruleId);
          const ruleId = links.get(g.ruleId);
          return (
            <div key={g.tag} className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <TagChip tag={g.tag} />
                <span className="text-[13px] font-semibold">{g.biasName}</span>
                <span className="font-num ml-auto text-[13px] font-bold" style={{ color: 'var(--risk)' }}>
                  {fmtUsd(-g.dollarCost)}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? 'Disarm' : 'Arm'} the ${g.biasName} fix`}
                  onClick={() => onToggle(g.ruleId)}
                  title={`${on ? 'Disarm' : 'Arm'} this bias fix — recomputes the clean curve live`}
                  className="transition-transform hover:scale-105"
                  style={{ opacity: on ? 1 : 0.75 }}
                >
                  <Switch on={on} />
                </button>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (g.dollarCost / max) * 100)}%`,
                    background: 'linear-gradient(90deg, var(--risk), var(--warn))',
                    transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
                  }}
                />
              </div>
              <div className="font-num mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                <span>{(g.pctOfLeak * 100).toFixed(1)}% of leak</span>
                <span>·</span>
                <span>
                  {g.tradeCount} trade{g.tradeCount === 1 ? '' : 's'}
                </span>
                <span>·</span>
                {ruleId ? (
                  <button
                    type="button"
                    onClick={jumpToDefense}
                    title={`Jump to ${ruleId} in the guardrails`}
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold transition-opacity hover:opacity-70"
                    style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                  >
                    ◈ {ruleId}
                  </button>
                ) : (
                  <span>{g.ruleId}</span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {g.rootCause}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--alpha)' }}>
                → {g.counterfactual}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
