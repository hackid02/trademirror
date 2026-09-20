// ─── TradeMirror · AI Synthesis Proxy (/api/audit) ────────────────────────────
// Bundles deterministic heuristic output + trade summary, proxies to Bitget Qwen
// (qwen3.8-max) in strict JSON mode. Falls back to a deterministic local
// synthesiser when no API key is configured or Qwen is unreachable — the demo
// never bricks for judges.

import { NextResponse } from 'next/server';
import type { DefenseRule, LeakTag, QwenAudit, TopLeak } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // gateway variance runs 20-70s; abort guards at 110s

const QWEN_BASE = 'https://hackathon.bitgetops.com/v1';
const QWEN_MODEL = 'qwen3.8-max';

const SYSTEM_PROMPT = `You are TradeMirror AI, a post-trade forensic analyst. You receive pre-computed findings.
Numbers are decided — your ONLY job is tight prose. Copy every dollar figure and ruleId EXACTLY; never recompute, never invent.

You must respond ONLY with a valid, parseable JSON object matching this schema (no markdown fences, no preamble):
{
  "psychologicalArchetype": string (4 words max),
  "executiveSummary": string (40 words max),
  "defenseRules": [ { "ruleId": string (copy exactly), "directive": string (12 words max), "rationale": string (14 words max), "triggerCondition": string (12 words max), "projectedSavingsUsd": number (copy the leak group dollarCost exactly), "deployTarget": "agent-hub" | "playbook" | "both" } ],
  "confidence": number (0-1),
  "entropy": number (0-1)
}

One rule per leak group in the evidence, using ONLY these canonical ruleIds:
- "Rule-W01 · Hard Lockout" for WEEKEND_SPREAD
- "Rule-T02 · 30m Cooldown" for REVENGE_TILT
- "Rule-H03 · Trailing Ratchet" for PREMATURE_EXIT
- "Rule-F04 · Session Governor" for EXHAUSTION_CLUSTER

Write tight. Answer directly from the evidence. Do not overthink, do not hedge, no filler.`;

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
  qwen?: boolean; // explicit false = force the deterministic fallback (cloud opt-out)
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
  // Minimal Qwen payload: long diagnostics (rootCause/counterfactual/triggerDetail)
  // balloon reasoning past the 55s budget, so the model only sees figures.
  const slimMetrics = (() => {
    const m = body.metrics ?? {};
    const pick = (k: string) => (typeof m[k] === 'number' ? m[k] : undefined);
    return {
      totalTrades: pick('totalTrades'), winRate: pick('winRate'), netPnl: pick('netPnl'),
      totalFees: pick('totalFees'), revengeCount: pick('revengeCount'), weekendCount: pick('weekendCount'),
    };
  })();
  const slimGroups = (body.groups ?? []).map((g) => ({ tag: g.tag, dollarCost: g.dollarCost, tradeCount: g.tradeCount }));
  const slimSamples = (body.samples ?? []).slice(0, 2).map((s) => ({
    orderId: s.orderId, symbol: s.symbol, tag: s.tag, pnl: s.pnl ?? s.realizedPnl ?? 0, leakUsd: s.leakUsd ?? 0,
  }));
  const userPayload = {
    persona: body.personaName ?? 'uploaded flow',
    metrics: slimMetrics,
    deterministicScore: body.score,
    deterministicGrade: body.grade,
    deterministicArchetype: body.archetype,
    leakGroups: slimGroups,
    flaggedSamples: slimSamples,
    instruction:
      'Copy all dollar figures EXACTLY from the leak groups. Write only the prose fields in the schema. Be surgical; executiveSummary ≤40 words.',
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
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(110000),
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
  // Explicit client opt-out (the UI default): the deterministic fallback
  // narrates without trade-derived data leaving for the LLM gateway.
  if (!apiKey || body.qwen === false) {
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
