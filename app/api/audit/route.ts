// ─── TradeMirror · AI Synthesis Proxy (/api/audit) ────────────────────────────
// Bundles deterministic heuristic output + trade summary, proxies to Bitget Qwen
// (qwen3.8-max) in strict JSON mode. Falls back to a deterministic local
// synthesiser when no API key is configured or Qwen is unreachable — the demo
// never bricks for judges.

import { NextResponse } from 'next/server';
import type { DefenseRule, LeakTag, QwenAudit, TopLeak } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QWEN_BASE = 'https://hackathon.bitgetops.com/v1';
const QWEN_MODEL = 'qwen3.8-max';

const SYSTEM_PROMPT = `You are TradeMirror AI, an institutional post-trade forensic analyst evaluating trader psychology on Bitget Unified Trading Account (UTA v3).
Your job is to provide surgical, unsparing, highly analytical behavioral audits on trader trade logs.

You will receive:
1. Aggregate metrics (win rate, gross PnL, total trades, volume).
2. Algorithmic leak flags detected in their data (weekend illiquidity, revenge tilt, premature exits, exhaustion clusters).
3. Sample flagged trade instances.

You must respond ONLY with a valid, parseable JSON object matching this schema (no markdown fences, no preamble):
{
  "behavioralScore": number,
  "letterGrade": string,
  "psychologicalArchetype": string,
  "executiveSummary": string,
  "totalEstimatedLeakUsd": number,
  "topLeaks": [ { "biasName": string, "tag": "WEEKEND_SPREAD" | "REVENGE_TILT" | "PREMATURE_EXIT" | "LOSS_AVERSION" | "EXHAUSTION_CLUSTER", "dollarCost": number, "tradeCount": number, "rootCause": string, "counterfactual": string } ],
  "defenseRules": [ { "ruleId": string, "directive": string, "rationale": string, "triggerCondition": string, "projectedSavingsUsd": number, "deployTarget": "agent-hub" | "playbook" | "both" } ],
  "shareableBlurb": string,
  "confidence": number,
  "entropy": number
}

Use ONLY these canonical ruleIds (omit a rule only if its leak group is absent from the evidence):
- "Rule-W01 · Hard Lockout" for WEEKEND_SPREAD (rToken/closed-hours flow)
- "Rule-T02 · 30m Cooldown" for REVENGE_TILT (post-loss urgency)
- "Rule-H03 · Trailing Ratchet" for PREMATURE_EXIT (clipped winners)
- "Rule-F04 · Session Governor" for EXHAUSTION_CLUSTER (fee-dense bursts)`;

interface AuditRequestBody {
  personaName?: string;
  metrics?: Record<string, number | string>;
  groups?: Array<{
    tag: LeakTag;
    biasName: string;
    dollarCost: number;
    tradeCount: number;
    rootCause: string;
    counterfactual: string;
  }>;
  samples?: Array<Record<string, string | number>>;
  score?: number;
  grade?: string;
  archetype?: string;
}

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function mockSynthesis(body: AuditRequestBody): QwenAudit {
  const m = body.metrics ?? {};
  const groups = body.groups ?? [];
  const num = (k: string, fb = 0): number => {
    const v = m[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : fb;
  };
  const score = body.score ?? 70;
  const grade = body.grade ?? 'C';
  const archetype = body.archetype ?? 'Unclassified Flow';
  const netPnl = num('netPnl');
  const totalTrades = Math.round(num('totalTrades'));
  const winRate = num('winRate');
  const totalLeak = groups.reduce((s, g) => s + (g.dollarCost ?? 0), 0);

  const topLeaks: TopLeak[] = groups.slice(0, 4).map((g) => ({
    biasName: g.biasName,
    tag: g.tag,
    dollarCost: Math.round(g.dollarCost * 100) / 100,
    tradeCount: g.tradeCount,
    rootCause: g.rootCause,
    counterfactual: g.counterfactual,
  }));

  const leakOf = (tag: LeakTag): number =>
    Math.round((groups.find((g) => g.tag === tag)?.dollarCost ?? 0) * 100) / 100;

  const defenseRules: DefenseRule[] = [];
  if (leakOf('WEEKEND_SPREAD') > 0) {
    defenseRules.push({
      ruleId: 'Rule-W01 · Hard Lockout',
      directive: 'Block rToken market orders while NYSE is closed (Fri 20:00 UTC → Sun 23:00 UTC + overnight).',
      rationale: 'Weekend fills pay a ~50bps synthetic-book spread vacuum with no underlying price discovery.',
      triggerCondition: 'assetType=rToken AND orderType=market AND nyseClosed=true',
      projectedSavingsUsd: leakOf('WEEKEND_SPREAD'),
      deployTarget: 'agent-hub',
    });
  }
  if ((body.metrics?.revengeCount as number) > 0 || leakOf('REVENGE_TILT') > 0) {
    defenseRules.push({
      ruleId: 'Rule-T02 · 30m Cooldown',
      directive: 'After any closed loss, freeze new entries for 30 minutes and cap next size at 1.1× trailing average.',
      rationale: 'Tilt re-entries inside 15 minutes at 1.4×+ size convert single losses into cascades.',
      triggerCondition: 'lastClosedPnl<0 AND secondsSinceClose<1800',
      projectedSavingsUsd: leakOf('REVENGE_TILT'),
      deployTarget: 'both',
    });
  }
  if (leakOf('PREMATURE_EXIT') > 0) {
    defenseRules.push({
      ruleId: 'Rule-H03 · Trailing Ratchet',
      directive: 'Winners get a 45-minute time-stop plus a 1R trailing ratchet — no manual clips before either trips.',
      rationale: 'Clipping winners in minutes while nursing losers for hours is loss aversion monetised against you.',
      triggerCondition: 'openPnl>0 AND holdSec<2700 AND manualExit=true',
      projectedSavingsUsd: leakOf('PREMATURE_EXIT'),
      deployTarget: 'playbook',
    });
  }
  if (leakOf('EXHAUSTION_CLUSTER') > 0) {
    defenseRules.push({
      ruleId: 'Rule-F04 · Session Governor',
      directive: 'Cap off-hours flow at 4 trades per rolling 2h; halt the session when fee/gross-win ratio crosses 0.6.',
      rationale: 'Dense scalp clusters in zero-edge windows run the fee meter faster than any available edge.',
      triggerCondition: 'tradesIn2h>=4 AND feeWinRatio>=0.6',
      projectedSavingsUsd: leakOf('EXHAUSTION_CLUSTER'),
      deployTarget: 'agent-hub',
    });
  }
  if (defenseRules.length === 0) {
    defenseRules.push({
      ruleId: 'Rule-S00 · Hold The Line',
      directive: 'No new guardrails required — pin current session limits and re-audit weekly.',
      rationale: 'Leak surface is within institutional tolerance; the edge now is regime compliance, not repair.',
      triggerCondition: 'weeklyLeakUsd > 0.5% of volume',
      projectedSavingsUsd: 0,
      deployTarget: 'both',
    });
  }

  const verdict =
    score >= 88
      ? 'Institutional-grade process control. Leak surface is negligible — protect the routine, not the strategy.'
      : score >= 70
        ? 'Functional edge with identifiable process fouls. The strategy survives; the execution routine needs guardrails.'
        : score >= 55
          ? 'The P&L is a behaviour problem wearing a strategy costume. Guardrails recover more than any new signal would.'
          : 'Capital is being donated to microstructure and tilt. Stop trading the current routine until lockouts are deployed.';

  return {
    behavioralScore: score,
    letterGrade: grade,
    psychologicalArchetype: archetype,
    executiveSummary: `${body.personaName ?? 'This flow'} ran ${totalTrades} trades at ${(winRate * 100).toFixed(0)}% win rate for ${money(netPnl)} ${netPnl >= 0 ? 'net' : 'net loss'}, with an estimated ${money(totalLeak)} of behaviour-attributable leak. ${verdict}`,
    totalEstimatedLeakUsd: Math.round(totalLeak * 100) / 100,
    topLeaks,
    defenseRules,
    shareableBlurb: `My TradeMirror audit: ${score}/100 (${grade}) — ${money(totalLeak)} in behavioral leaks found. Weekend spreads, tilt sizing, early clips… quantified.`,
    confidence: 0.82,
    entropy: score >= 88 ? 0.18 : 0.31,
  };
}

async function callQwen(body: AuditRequestBody, apiKey: string): Promise<QwenAudit> {
  const userPayload = {
    persona: body.personaName ?? 'uploaded flow',
    metrics: body.metrics ?? {},
    deterministicScore: body.score,
    deterministicGrade: body.grade,
    deterministicArchetype: body.archetype,
    leakGroups: body.groups ?? [],
    flaggedSamples: (body.samples ?? []).slice(0, 12),
    instruction:
      'Refine the deterministic findings into the audit JSON. Keep dollar figures consistent with the provided leak groups (±5%). Be surgical and specific.',
  };

  const res = await fetch(`${QWEN_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.3,
      max_tokens: 2200,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qwen HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  const cleaned = content.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<QwenAudit>;

  // Validate + coerce with safe fallbacks
  const fallback = mockSynthesis(body);
  return {
    behavioralScore: typeof parsed.behavioralScore === 'number' ? parsed.behavioralScore : fallback.behavioralScore,
    letterGrade: typeof parsed.letterGrade === 'string' ? parsed.letterGrade : fallback.letterGrade,
    psychologicalArchetype:
      typeof parsed.psychologicalArchetype === 'string' ? parsed.psychologicalArchetype : fallback.psychologicalArchetype,
    executiveSummary: typeof parsed.executiveSummary === 'string' ? parsed.executiveSummary : fallback.executiveSummary,
    totalEstimatedLeakUsd:
      typeof parsed.totalEstimatedLeakUsd === 'number' ? parsed.totalEstimatedLeakUsd : fallback.totalEstimatedLeakUsd,
    topLeaks: Array.isArray(parsed.topLeaks) && parsed.topLeaks.length > 0 ? (parsed.topLeaks as TopLeak[]) : fallback.topLeaks,
    defenseRules:
      Array.isArray(parsed.defenseRules) && parsed.defenseRules.length > 0
        ? (parsed.defenseRules as DefenseRule[])
        : fallback.defenseRules,
    shareableBlurb: typeof parsed.shareableBlurb === 'string' ? parsed.shareableBlurb : fallback.shareableBlurb,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
    entropy: typeof parsed.entropy === 'number' ? parsed.entropy : 0.28,
  };
}

export async function POST(req: Request) {
  const started = Date.now();
  let body: AuditRequestBody = {};
  try {
    body = (await req.json()) as AuditRequestBody;
  } catch {
    body = {};
  }

  const apiKey = process.env.BITGET_QWEN_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      source: 'mock',
      model: 'trademirror-deterministic/1.0',
      latencyMs: Date.now() - started,
      degraded: true,
      audit: mockSynthesis(body),
    });
  }

  try {
    const audit = await callQwen(body, apiKey);
    return NextResponse.json({
      source: 'qwen',
      model: QWEN_MODEL,
      latencyMs: Date.now() - started,
      audit,
    });
  } catch (err) {
    return NextResponse.json({
      source: 'mock',
      model: 'trademirror-deterministic/1.0',
      latencyMs: Date.now() - started,
      degraded: true,
      error: err instanceof Error ? err.message : 'Qwen unreachable',
      audit: mockSynthesis(body),
    });
  }
}
