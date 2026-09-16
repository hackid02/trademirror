// ─── TradeMirror · Ask Mirror LUI (/api/ask) ─────────────────────────────────
// Natural-language Q&A over the trader's OWN audit. Evidence-only: the model
// answers strictly from the supplied flags/metrics and cites order IDs.
// Abstains when the question isn't answerable from the trade log.
// Falls back to a deterministic keyword responder when Qwen is unavailable.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QWEN_BASE = 'https://hackathon.bitgetops.com/v1';
const QWEN_MODEL = 'qwen3.8-max';

const ASK_SYSTEM = `You are Ask Mirror, the conversational layer of TradeMirror — a post-trade forensic workbench for Bitget UTA v3 flows.

STRICT RULES:
1. Answer ONLY from the supplied audit evidence (metrics, leak groups, flagged trades). Never invent trades, prices, dates, or dollar amounts.
2. Cite every specific claim with the trade's order ID in square brackets, e.g. [TM-WC-0007]. Use only IDs from the evidence.
3. If the question cannot be answered from the evidence (live prices, future predictions, trades not in the log), say so explicitly: "That's not in your uploaded flow — I can only reason over your N logged trades." Suggest the closest answerable question.
4. Keep answers tight: 2-5 sentences plus a one-line "do this" action. Plain text, no markdown tables.
5. All dollar figures must match the evidence (±1%). This is number-locked: an invented decimal invalidates the response.

Respond ONLY with JSON: { "answer": string, "citations": string[] }`;

export interface AskFlag {
  orderId: string;
  symbol: string;
  side: string;
  pnl: number;
  tag: string;
  leakUsd: number;
  trigger: string;
  narrative: string;
}

interface AskBody {
  question?: string;
  personaName?: string;
  metrics?: Record<string, number | string>;
  groups?: Array<{ tag: string; biasName: string; dollarCost: number; tradeCount: number }>;
  flags?: AskFlag[];
  score?: number;
  grade?: string;
  archetype?: string;
}

const num = (m: Record<string, number | string> | undefined, k: string, fb = 0): number => {
  const v = m?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
};
const money = (n: number): string =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function topCited(flags: AskFlag[], tag: string, n = 4): string[] {
  return [...flags]
    .filter((f) => f.tag === tag)
    .sort((a, b) => b.leakUsd - a.leakUsd)
    .slice(0, n)
    .map((f) => f.orderId);
}

function allTop(flags: AskFlag[], n = 4): string[] {
  return [...flags].sort((a, b) => b.leakUsd - a.leakUsd).slice(0, n).map((f) => f.orderId);
}

function citeList(ids: string[]): string {
  return ids.map((id) => `[${id}]`).join(' ');
}

// Deterministic fallback: keyword-routed answers computed from real numbers.
function fallbackAnswer(body: AskBody): { answer: string; citations: string[] } {
  const q = (body.question ?? '').toLowerCase();
  const m = body.metrics ?? {};
  const flags = body.flags ?? [];
  const groups = body.groups ?? {};
  const leakOf = (tag: string): number =>
    (Array.isArray(groups) ? groups : []).find((g) => g.tag === tag)?.dollarCost ?? 0;
  const totalTrades = Math.round(num(m, 'totalTrades'));
  const totalLeak = (Array.isArray(groups) ? groups : []).reduce((s, g) => s + g.dollarCost, 0);
  const netPnl = num(m, 'netPnl');
  const cleanPnl = num(m, 'cleanPnl');

  if (/weekend|saturday|sunday|spread|rtn|rtoken|closed|nyse/.test(q)) {
    const c = topCited(flags, 'WEEKEND_SPREAD');
    if (!c.length)
      return {
        answer: `No weekend-spread flags in this flow — rToken orders stayed inside NYSE hours or used limits. That's textbook session hygiene; nothing to fix here.`,
        citations: [],
      };
    return {
      answer: `Weekend spreads bled ${money(leakOf('WEEKEND_SPREAD'))} across ${c.length}+ flagged fills — market rToken orders while NYSE was closed pay ~50bps of synthetic-book vacuum. Worst offenders: ${citeList(c)}. Do this: hard-lock rToken market orders Fri 20:00 UTC → Sun 23:00 UTC (Rule-W01).`,
      citations: c,
    };
  }
  if (/tilt|revenge|siz(e|ing)|chase|chasing|after.*loss|too big|angry|panic/.test(q)) {
    const c = topCited(flags, 'REVENGE_TILT');
    if (!c.length)
      return {
        answer: `No tilt sizing detected — no entries within 15 minutes of a loss at 1.4×+ size. Post-loss discipline is holding.`,
        citations: [],
      };
    return {
      answer: `Tilt sizing cost ${money(leakOf('REVENGE_TILT'))}: entries fired within minutes of a red close at 1.4×+ normal size, e.g. ${citeList(c)}. Each one turned a single loss into a cascade. Do this: 30-minute post-loss cooldown + 1.1× size cap (Rule-T02).`,
      citations: c,
    };
  }
  if (/winner|early|clip|hold|disposition|cut.*(win|profit)|runner|exit/.test(q)) {
    const c = topCited(flags, 'PREMATURE_EXIT');
    const ratio = num(m, 'dispositionRatio', 1);
    if (!c.length)
      return {
        answer: `Win/loss hold symmetry looks healthy (ratio ${ratio.toFixed(2)}). Winners aren't being clipped early in this flow.`,
        citations: [],
      };
    return {
      answer: `You're clipping winners while nursing losers (hold ratio ${ratio.toFixed(2)}, alert under 0.25) — ${money(leakOf('PREMATURE_EXIT'))} in uncaptured runners, e.g. ${citeList(c)}. Do this: 45-minute time-stop + 1R trailing ratchet on every winner (Rule-H03).`,
      citations: c,
    };
  }
  if (/overtrad|cluster|exhaust|too many|fees?|churn|session/.test(q)) {
    const c = topCited(flags, 'EXHAUSTION_CLUSTER');
    if (!c.length)
      return {
        answer: `No exhaustion clusters — no 2-hour window where fees outran gross wins. Session pacing is fine.`,
        citations: [],
      };
    return {
      answer: `Off-hours overtrading bled ${money(leakOf('EXHAUSTION_CLUSTER'))}: dense scalp clusters where the fee meter ran faster than edge, e.g. ${citeList(c)}. Do this: cap flow at 4 trades per rolling 2h and kill the session past 0.6 fee/win ratio (Rule-F04).`,
      citations: c,
    };
  }
  if (/save|recover|clean|discipline|worth|guardrail|rule|fix|improve|what.if|what if/.test(q)) {
    const c = allTop(flags, 5);
    return {
      answer: `${body.personaName ?? 'This flow'} finished ${money(netPnl)} actual vs ${money(cleanPnl)} on the behavior-filtered path — discipline was worth ${money(cleanPnl - netPnl)}. Biggest recoveries sit in ${citeList(c)}. Do this: arm every guardrail in the defense plan, then re-audit next week and watch the gap close.`,
      citations: c,
    };
  }
  if (/score|grade|archetype|good|bad|rate|verdict|summary|overview|how.*(did|am)|bleed|lost|lose/.test(q)) {
    const c = allTop(flags, 4);
    return {
      answer: `${body.personaName ?? 'This flow'}: ${body.score ?? '—'}/100 (${body.grade ?? '—'}) — ${body.archetype ?? 'unclassified'}, ${totalTrades} trades, ${money(netPnl)} net with ${money(totalLeak)} of behaviour-attributable leak. Dominant fouls: ${citeList(c)}. Ask me about weekends, tilt, winners, or fees for the receipt-level breakdown.`,
      citations: c,
    };
  }
  const c = allTop(flags, 3);
  return {
    answer: `I can only reason over your ${totalTrades} logged trades (score ${body.score ?? '—'}/100, ${money(totalLeak)} leak). Try: "why weekends?", "show my tilt pattern", "am I cutting winners early?", or "what would discipline have saved?" — starting points: ${citeList(c)}.`,
    citations: c,
  };
}

async function callQwen(body: AskBody, apiKey: string): Promise<{ answer: string; citations: string[] }> {
  const known = new Set((body.flags ?? []).map((f) => f.orderId));
  const res = await fetch(`${QWEN_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages: [
        { role: 'system', content: ASK_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            question: body.question,
            persona: body.personaName,
            score: body.score,
            grade: body.grade,
            archetype: body.archetype,
            metrics: body.metrics,
            leakGroups: body.groups,
            flaggedTrades: (body.flags ?? []).slice(0, 40),
          }),
        },
      ],
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Qwen HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = (data.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(content) as { answer?: string; citations?: string[] };
  if (!parsed.answer) throw new Error('empty Qwen answer');
  // Number-lock hygiene: keep only citations that exist in evidence.
  const citations = (Array.isArray(parsed.citations) ? parsed.citations : []).filter((c) => known.has(c));
  // Also harvest [ORDER-ID] citations embedded in prose.
  const embedded = [...parsed.answer.matchAll(/\[([A-Z0-9-]+)\]/g)]
    .map((mm) => mm[1])
    .filter((c) => known.has(c) && !citations.includes(c));
  return { answer: parsed.answer, citations: [...citations, ...embedded].slice(0, 8) };
}

export async function POST(req: Request) {
  const started = Date.now();
  let body: AskBody = {};
  try {
    body = (await req.json()) as AskBody;
  } catch {
    body = {};
  }
  if (!body.question?.trim()) {
    return NextResponse.json({ error: 'question required' }, { status: 400 });
  }
  const apiKey = process.env.BITGET_QWEN_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      source: 'mock',
      model: 'trademirror-deterministic/1.0',
      latencyMs: Date.now() - started,
      degraded: true,
      ...fallbackAnswer(body),
    });
  }
  try {
    const out = await callQwen(body, apiKey);
    return NextResponse.json({ source: 'qwen', model: QWEN_MODEL, latencyMs: Date.now() - started, ...out });
  } catch {
    return NextResponse.json({
      source: 'mock',
      model: 'trademirror-deterministic/1.0',
      latencyMs: Date.now() - started,
      degraded: true,
      ...fallbackAnswer(body),
    });
  }
}
