'use client';

import { useMemo, useState } from 'react';
import type { QwenAudit } from '@/lib/types';
import { mapRuleToEngine } from '@/lib/analysis';
import { fmtUsd } from '@/lib/engine';
import { Card, SectionTitle, SoftBadge, Switch } from './ui';

/** Prop-desk escalation grammar: rules read as staged enforcement, not a bullet list. */
const STAGE: Record<string, { n: string; verb: string }> = {
  LEAK_WEEKEND_RTOKEN: { n: 'S1', verb: 'PREVENT' },
  LEAK_REVENGE_TILT: { n: 'S2', verb: 'COOLDOWN' },
  LEAK_DISPOSITION_ASYMMETRY: { n: 'S3', verb: 'CONTAIN' },
  LEAK_EXHAUSTION_CLUSTER: { n: 'S2', verb: 'THROTTLE' },
};

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="font-num flex justify-between text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
        <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

export default function DefensePlan({
  audit,
  running,
  source,
  latencyMs,
  degraded,
  onRun,
  armed,
  onToggleRule,
  onArmAll,
  cleanDelta,
}: {
  audit: QwenAudit | null;
  running: boolean;
  source: 'qwen' | 'mock';
  latencyMs: number;
  degraded: boolean;
  onRun: () => void;
  armed: string[]; // enabled engine ruleIds — shared with the what-if curve
  onToggleRule: (engineRuleId: string) => void;
  onArmAll: (arm: boolean) => void; // master switch — full discipline or raw actual
  cleanDelta: number; // live recovered $ from armed rules
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!audit) return [];
    return audit.defenseRules.map((r) => {
      const engineId = mapRuleToEngine(r.ruleId, r.directive);
      return { rule: r, engineId, on: engineId ? armed.includes(engineId) : true, stage: engineId ? STAGE[engineId] ?? null : null };
    });
  }, [audit, armed]);

  const armedCount = rows.filter((r) => r.on).length;
  const selectedSavings = rows.filter((r) => r.on).reduce((s, r) => s + r.rule.projectedSavingsUsd, 0);
  const maxSavings = rows.length ? Math.max(...rows.map((r) => r.rule.projectedSavingsUsd)) : 0;

  const copyRule = async (r: (typeof rows)[number]['rule']) => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            ruleId: r.ruleId,
            deployTarget: r.deployTarget,
            triggerCondition: r.triggerCondition,
            directive: r.directive,
            projectedSavingsUsd: r.projectedSavingsUsd,
          },
          null,
          2,
        ),
      );
      setCopied(r.ruleId);
      window.setTimeout(() => setCopied((c) => (c === r.ruleId ? null : c)), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <Card className="flex h-full flex-col p-5" hover>
      <SectionTitle
        eyebrow="AI cognitive synthesis · Bitget Qwen"
        title="Defense guardrails"
        right={
          audit ? (
            <SoftBadge tone={source === 'qwen' ? 'alpha' : 'warn'}>
              {source === 'qwen' ? `qwen3.8-max · ${latencyMs}ms` : `deterministic fallback · ${latencyMs}ms`}
            </SoftBadge>
          ) : undefined
        }
      />

      {!audit && !running && (
        <div className="grid flex-1 place-items-center rounded-xl px-4 py-10 text-center" style={{ background: 'var(--surface-2)', border: '1px dashed var(--border-strong)' }}>
          <div>
            <div className="text-[14px] font-semibold">Heuristics are computed. Now get the verdict.</div>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              Sends leak flags + aggregate metrics to <span className="font-num">qwen3.8-max</span> via the
              hackathon gateway for an institutional-grade narrative + defense plan.
            </p>
            <button
              onClick={onRun}
              className="mt-4 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-transform hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'var(--accent)', color: '#04121a' }}
            >
              ◈ Run Qwen Audit
            </button>
          </div>
        </div>
      )}

      {running && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="thinking-shimmer rounded-xl p-4 text-[13px] font-medium" style={{ border: '1px solid var(--border)' }}>
            ◈ Qwen is dissecting {audit ? 'the updated' : 'your'} flow — scoring psychology, pricing each bias…
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="thinking-shimmer h-20 rounded-xl" style={{ border: '1px solid var(--border)' }} />
          ))}
        </div>
      )}

      {audit && !running && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="rounded-xl p-3.5" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)' }}>
            <div className="font-num text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
              Executive summary · {audit.psychologicalArchetype}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink)' }}>
              {audit.executiveSummary}
            </p>
            <div className="mt-3 flex gap-4">
              <Meter label="Model confidence" value={audit.confidence} />
              <Meter label="Epistemic entropy" value={audit.entropy} />
            </div>
            {degraded && (
              <p className="font-num mt-2 text-[10px]" style={{ color: 'var(--warn)' }}>
                ※ served by deterministic fallback (no Qwen key on server or gateway unreachable) — wire
                BITGET_QWEN_API_KEY for live LLM synthesis.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-num text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
              What-if · {armedCount}/{rows.length} armed
            </span>
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => onArmAll(true)}
                className="font-num rounded-lg px-2 py-1 text-[10.5px] font-bold transition-transform hover:scale-[1.04]"
                style={{ border: '1px solid var(--alpha)', color: 'var(--alpha)' }}
                title="Arm every guardrail — full-discipline clean curve"
              >
                Arm all
              </button>
              <button
                onClick={() => onArmAll(false)}
                className="font-num rounded-lg px-2 py-1 text-[10.5px] font-bold transition-transform hover:scale-[1.04]"
                style={{ border: '1px solid var(--risk)', color: 'var(--risk)' }}
                title="Disarm all — raw undisciplined curve (the kill-switch view)"
              >
                Disarm
              </button>
            </span>
            <span className="font-num text-[12px] font-bold" style={{ color: cleanDelta >= 0 ? 'var(--alpha)' : 'var(--risk)' }}>
              {fmtUsd(cleanDelta, true)} on clean curve ↑
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {rows.map(({ rule: r, engineId, on, stage }) => (
              <label
                key={r.ruleId}
                className="flex gap-3 rounded-xl p-3 transition-opacity"
                style={{
                  background: 'var(--surface-2)',
                  border: `1px solid ${on ? 'var(--alpha)' : 'var(--border)'}`,
                  opacity: on ? 1 : 0.6,
                  cursor: engineId ? 'pointer' : 'default',
                }}
                title={engineId ? `Toggles ${engineId} recovery on the clean curve` : 'Advisory rule — no engine mapping'}
              >
                {engineId ? (
                  <>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggleRule(engineId)}
                      aria-label={`Toggle ${engineId} recovery on the clean curve`}
                      className="sr-only"
                    />
                    <span className="mt-0.5 shrink-0">
                      <Switch on={on} />
                    </span>
                  </>
                ) : (
                  <span
                    className="font-num mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
                    style={{ color: 'var(--ink-3)', background: 'var(--surface-3)' }}
                  >
                    ADVISORY
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-num text-[12px] font-bold">{r.ruleId}</span>
                    {stage && (
                      <span
                        className="font-num rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                        style={{ color: 'var(--warn)', background: 'var(--warn-soft)' }}
                        title={`Escalation stage ${stage.n}: ${stage.verb}`}
                      >
                        {stage.n} · {stage.verb}
                      </span>
                    )}
                    <span
                      className="font-num rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                    >
                      {r.deployTarget === 'both' ? 'agent-hub + playbook' : r.deployTarget}
                    </span>
                    <span className="font-num ml-auto flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--alpha)' }}>
                      {maxSavings > 0 && r.projectedSavingsUsd === maxSavings && (
                        <span
                          className="rounded px-1 py-px text-[9px] font-bold tracking-wide"
                          style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                          title="Highest projected savings — arm this one first"
                        >
                          ★ TOP SAVE
                        </span>
                      )}
                      {fmtUsd(r.projectedSavingsUsd)}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void copyRule(r);
                        }}
                        title="Copy rule JSON for Agent Hub / Playbook"
                        className="rounded px-1 text-[11px] font-bold transition-opacity hover:opacity-70"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        {copied === r.ruleId ? '✓' : '⧉'}
                      </button>
                    </span>
                  </span>
                  <span className="mt-1 block text-[12.5px] font-medium leading-snug">{r.directive}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: 'var(--ink-3)' }}>
                    {r.rationale}
                  </span>
                  <span className="font-num mt-1 block truncate text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    IF {r.triggerCondition}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="font-num rounded-xl px-3 py-2 text-[11px]" style={{ background: 'var(--alpha-soft)', color: 'var(--alpha)' }}>
            ⚗ Toggling a guardrail recomputes the counterfactual curve live — {fmtUsd(selectedSavings)} selected savings.
          </div>

          <button
            onClick={onRun}
            className="font-num mt-1 rounded-xl px-3 py-2 text-[12px] font-semibold"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
          >
            ↻ Re-run audit
          </button>
        </div>
      )}
    </Card>
  );
}
