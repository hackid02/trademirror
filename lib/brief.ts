// ─── TradeMirror · X brief builder (pure + unit-testable) ─────────────────────
// Single-post budget: 280 chars. X counts every URL as 23 chars (t.co), but we
// keep the RAW string ≤ 280 against a 60-char URL budget so it fits regardless.

import { fmtUsd } from './engine';

export interface BriefMetrics {
  score: number;
  grade: string;
  archetype: string;
  totalLeakUsd: number;
  totalTrades: number;
  cleanPnl: number;
  netPnl: number;
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildXBrief(m: BriefMetrics, personaName: string, url: string): string {
  const persona = clip(personaName, 30);
  const arch = clip(m.archetype, 34);
  return (
    `🪞 TradeMirror audit — ${persona}: ${m.score}/100 (${m.grade}) · ${arch}.\n` +
    `Leaks ${fmtUsd(-m.totalLeakUsd)} in ${m.totalTrades} trades. ` +
    `Clean ${fmtUsd(m.cleanPnl, true)} vs actual ${fmtUsd(m.netPnl, true)}.\n` +
    `#BitgetHackathon @Bitget_AI\n` +
    url
  );
}
