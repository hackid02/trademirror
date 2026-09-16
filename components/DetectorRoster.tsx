'use client';

import { useMemo } from 'react';
import type { LeakFlag, LeakTag, QwenAudit } from '@/lib/types';
import { ENGINE_RULE_IDS, mapRuleToEngine } from '@/lib/analysis';
import { fmtUsd } from '@/lib/engine';
import { Card, SectionTitle, SoftBadge, Switch, TagChip } from './ui';

type EngineRuleId = (typeof ENGINE_RULE_IDS)[number];

const META: Record<EngineRuleId, { name: string; tags: LeakTag[]; blurb: string; note?: string }> = {
  LEAK_WEEKEND_RTOKEN: {
    name: 'Weekend spread trap',
    tags: ['WEEKEND_SPREAD'],
    blurb: 'rToken fills while NYSE is closed — spread vacuum, no edge.',
    note: '“Sometimes the best trade is no trade.”',
  },
  LEAK_REVENGE_TILT: {
    name: 'Revenge tilt sizing',
    tags: ['REVENGE_TILT'],
    blurb: 'Oversized re-entry minutes after a loss — the chase reflex.',
  },
  LEAK_DISPOSITION_ASYMMETRY: {
    name: 'Disposition asymmetry',
    tags: ['PREMATURE_EXIT', 'LOSS_AVERSION'],
    blurb: 'Clipped winners, nursed losers — exits working backwards.',
  },
  LEAK_EXHAUSTION_CLUSTER: {
    name: 'Exhaustion cluster',
    tags: ['EXHAUSTION_CLUSTER'],
    blurb: 'Overtrading bursts where fees outrun gross edge.',
  },
};

export default function DetectorRoster({
  flags,
  armed,
  onToggle,
  audit,
  totalLeak,
}: {
  flags: LeakFlag[];
  armed: string[];
  onToggle: (engineRuleId: string) => void;
  audit: QwenAudit | null;
  totalLeak: number;
}) {
  const stats = useMemo(() => {
    const m = new Map<string, { n: number; leak: number }>();
    for (const f of flags) {
      const s = m.get(f.ruleId) ?? { n: 0, leak: 0 };
      s.n += 1;
      s.leak += f.dollarCost;
      m.set(f.ruleId, s);
    }
    return m;
  }, [flags]);

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

  const jumpToDefense = (e: React.MouseEvent) => {
    e.stopPropagation();
    document.querySelector('[data-tour="defense"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const armedCount = ENGINE_RULE_IDS.filter((id) => armed.includes(id)).length;

  return (
    <Card className="flex h-full flex-col p-5" hover>
      <SectionTitle
        eyebrow="Detector array · confluence engine"
        title="Active detectors"
        right={<SoftBadge tone={armedCount === ENGINE_RULE_IDS.length ? 'alpha' : 'warn'}>{armedCount}/{ENGINE_RULE_IDS.length} armed</SoftBadge>}
      />
      <div className="flex flex-1 flex-col gap-2">
        {ENGINE_RULE_IDS.map((id) => {
          const meta = META[id];
          const s = stats.get(id) ?? { n: 0, leak: 0 };
          const on = armed.includes(id);
          const ruleId = links.get(id);
          const live = on && s.n > 0;
          const status = !on
            ? s.n > 0
              ? '○ off — leak unguarded'
              : '○ off'
            : s.n > 0
              ? '● watching live'
              : '○ standing by';
          const share = totalLeak > 0 ? Math.max(0, Math.min(1, s.leak / totalLeak)) : 0;
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              title={on ? `Disarm ${meta.name} — removes its recovery from the clean curve` : `Arm ${meta.name} — restores its recovery on the clean curve`}
              className="rounded-xl p-3 text-left transition-opacity"
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${on ? 'var(--alpha)' : 'var(--border)'}`,
                opacity: on ? 1 : 0.62,
              }}
            >
              <div className="flex items-center gap-2.5">
                <Switch on={on} />
                <span className="text-[13px] font-bold">{meta.name}</span>
                <span className="font-num ml-auto shrink-0 whitespace-nowrap text-[11px] font-bold" style={{ color: s.leak > 0 ? 'var(--risk)' : 'var(--ink-3)' }}>
                  {s.n > 0 ? `${s.n} flags · ${fmtUsd(-s.leak)}` : 'no hits'}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${share <= 0 ? 0 : Math.max(2, share * 100)}%`,
                    background: 'linear-gradient(90deg, var(--risk), var(--warn))',
                    transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
                  }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {meta.tags.map((t) => (
                  <TagChip key={t} tag={t} />
                ))}
                {ruleId && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={jumpToDefense}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        jumpToDefense(e as unknown as React.MouseEvent);
                      }
                    }}
                    title={`Jump to ${ruleId} in the guardrails`}
                    className="font-num rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ color: 'var(--accent)', background: 'var(--accent-soft)', cursor: 'pointer' }}
                  >
                    ◈ {ruleId}
                  </span>
                )}
                <span
                  className={`font-num ml-auto text-[10px] font-semibold ${live ? 'animate-pulse' : ''}`}
                  style={{ color: live ? 'var(--alpha)' : 'var(--ink-3)' }}
                >
                  {status}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--ink-3)' }}>
                {meta.blurb}
              </p>
              {meta.note && (
                <p className="font-num mt-0.5 text-[11px] italic" style={{ color: 'var(--ink-3)' }}>
                  {meta.note}
                </p>
              )}
            </button>
          );
        })}
      </div>
      <div className="font-num mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
        ◈ Wired to the what-if engine — toggling recomputes the clean curve, in sync with taxonomy + guardrails.
      </div>
    </Card>
  );
}
