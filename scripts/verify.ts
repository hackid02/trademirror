// ─── TradeMirror · verify: invariant gates over every persona ─────────────────
// Run: npx tsx scripts/verify.ts  (exit 1 on any failure — CI / pre-submit gate)

import { runAudit } from '../lib/engine';
import {
  ENGINE_RULE_IDS,
  computeCleanCurveWithRules,
  computeLeakHeatmap,
  computeSparkSeries,
} from '../lib/analysis';
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
  const { metrics: m, groups, flags, curve } = runAudit(p.trades);
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
  // Reconciliation: clean − net MUST equal the attributed leak, and every
  // consumer (what-if, heatmap, spark) must agree on the same total.
  const last = curve[curve.length - 1];
  const gap = curve.length ? last.clean - last.actual : 0;
  ok(
    Math.abs(gap - m.totalLeakUsd) < 0.01,
    `${p.name}: clean−net $${gap.toFixed(2)} == totalLeak $${m.totalLeakUsd.toFixed(2)}`,
  );
  const wi = computeCleanCurveWithRules(p.trades, flags, new Set([...ENGINE_RULE_IDS]));
  ok(
    Math.abs(wi.recovered - m.totalLeakUsd) < 0.01,
    `${p.name}: what-if recovered $${wi.recovered.toFixed(2)} == totalLeak`,
  );
  const heat = computeLeakHeatmap(p.trades, flags);
  ok(
    Math.abs(heat.totalLeak - m.totalLeakUsd) < 0.01,
    `${p.name}: heatmap total $${heat.totalLeak.toFixed(2)} == totalLeak`,
  );
  const spark = computeSparkSeries(p.trades, curve, flags);
  const sparkFinal = spark.cumLeak[spark.cumLeak.length - 1] ?? 0;
  ok(
    Math.abs(sparkFinal - m.totalLeakUsd) < 0.01,
    `${p.name}: spark cumLeak $${sparkFinal.toFixed(2)} == totalLeak`,
  );
  const brief = buildXBrief(m, p.name, `https://trademirror.example/audit/${'x'.repeat(38)}`);
  ok(brief.length <= 280, `${p.name}: X brief ${brief.length}/280 chars (60-char URL budget)`);
}

// Duplicate-orderId fixture: partial-fill exports reuse orderIds across rows.
// Identity is positional (tradeIndex) — reconciliation must hold regardless.
{
  const src = buildPersonas()[0].trades;
  const clone = { ...src[0], timestamp: src[0].timestamp + 1000 };
  const fixture = [...src, clone];
  const dupIds = fixture.length - new Set(fixture.map((t) => t.orderId)).size;
  ok(dupIds > 0, `dup-orderId fixture: ${dupIds} reused orderId present`);
  const { metrics: dm, groups: dg, flags: df, curve: dc } = runAudit(fixture);
  const dlast = dc[dc.length - 1];
  const dgap = dc.length ? dlast.clean - dlast.actual : 0;
  ok(
    Math.abs(dgap - dm.totalLeakUsd) < 0.01,
    `dup-orderId fixture: clean−net $${dgap.toFixed(2)} == totalLeak $${dm.totalLeakUsd.toFixed(2)}`,
  );
  const dgsum = dg.reduce((s, g) => s + g.dollarCost, 0);
  ok(
    Math.abs(dgsum - dm.totalLeakUsd) < 0.01,
    `dup-orderId fixture: groups sum $${dgsum.toFixed(2)} == totalLeak`,
  );
  const dwi = computeCleanCurveWithRules(fixture, df, new Set([...ENGINE_RULE_IDS]));
  ok(
    Math.abs(dwi.recovered - dm.totalLeakUsd) < 0.01,
    `dup-orderId fixture: what-if recovered $${dwi.recovered.toFixed(2)} == totalLeak`,
  );
  const dheat = computeLeakHeatmap(fixture, df);
  ok(
    Math.abs(dheat.totalLeak - dm.totalLeakUsd) < 0.01,
    `dup-orderId fixture: heatmap total $${dheat.totalLeak.toFixed(2)} == totalLeak`,
  );
  const dspark = computeSparkSeries(fixture, dc, df);
  const dsparkFinal = dspark.cumLeak[dspark.cumLeak.length - 1] ?? 0;
  ok(
    Math.abs(dsparkFinal - dm.totalLeakUsd) < 0.01,
    `dup-orderId fixture: spark cumLeak $${dsparkFinal.toFixed(2)} == totalLeak`,
  );
}

console.log(failures === 0 ? '\nVERIFY: all gates passed' : `\nVERIFY: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
