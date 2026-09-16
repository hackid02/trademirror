// ─── TradeMirror · verify: invariant gates over every persona ─────────────────
// Run: npx tsx scripts/verify.ts  (exit 1 on any failure — CI / pre-submit gate)

import { runAudit } from '../lib/engine';
import { buildPersonas } from '../lib/mockProfiles';
import { buildXBrief } from '../lib/brief';

let failures = 0;
const ok = (cond: boolean, msg: string): void => {
  if (!cond) {
    failures += 1;
    console.error(`FAIL  ${msg}`);
  } else {
    console.log(`ok    ${msg}`);
  }
};

for (const p of buildPersonas()) {
  const { metrics: m, groups, flags } = runAudit(p.trades);
  const ids = new Set(p.trades.map((t) => t.orderId));
  ok(Number.isInteger(m.score) && m.score >= 0 && m.score <= 100, `${p.name}: score ${m.score} in 0–100`);
  ok(m.grade.length > 0 && m.archetype.length > 0, `${p.name}: grade+archetype present`);
  ok(
    [m.totalLeakUsd, m.netPnl, m.cleanPnl, m.winRate].every((n) => Number.isFinite(n)),
    `${p.name}: core numerics finite`,
  );
  ok(m.winRate >= 0 && m.winRate <= 1, `${p.name}: winRate ${(m.winRate * 100).toFixed(1)}% in range`);
  ok(m.totalTrades === p.trades.length, `${p.name}: totalTrades matches input (${m.totalTrades})`);
  ok(flags.every((f) => ids.has(f.orderId)), `${p.name}: all ${flags.length} flags reference real orders`);
  ok(flags.every((f) => f.dollarCost >= 0), `${p.name}: all flag costs non-negative`);
  const gsum = groups.reduce((s, g) => s + g.dollarCost, 0);
  ok(
    Math.abs(gsum - m.totalLeakUsd) < 0.01,
    `${p.name}: groups sum $${gsum.toFixed(2)} == totalLeak $${m.totalLeakUsd.toFixed(2)}`,
  );
  ok(groups.every((g) => g.dollarCost > 0.01), `${p.name}: groups pass the >$0.01 display filter`);
  const brief = buildXBrief(m, p.name, `https://trademirror.example/audit/${'x'.repeat(38)}`);
  ok(brief.length <= 280, `${p.name}: X brief ${brief.length}/280 chars (60-char URL budget)`);
}

console.log(failures === 0 ? '\nVERIFY: all gates passed' : `\nVERIFY: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
