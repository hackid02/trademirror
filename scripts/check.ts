import { runAudit, fmtUsd } from '../lib/engine';
import { buildPersonas } from '../lib/mockProfiles';

for (const p of buildPersonas()) {
  const { metrics, groups, flags } = runAudit(p.trades);
  console.log(`\n=== ${p.name} (${p.trades.length} trades) ===`);
  console.log(`score=${metrics.score} grade=${metrics.grade} archetype=${metrics.archetype}`);
  console.log(`net=${fmtUsd(metrics.netPnl, true)} clean=${fmtUsd(metrics.cleanPnl, true)} leak=${fmtUsd(-metrics.totalLeakUsd)}`);
  console.log(`winRate=${(metrics.winRate * 100).toFixed(1)}% flags=${flags.length} flaggedOrders=${new Set(flags.map((f) => f.orderId)).size}`);
  console.log(`revenge=${metrics.revengeCount} weekend=${metrics.weekendCount} premature=${metrics.prematureCount} cluster=${metrics.clusterCount}`);
  for (const g of groups) {
    console.log(`  ${g.tag}: ${fmtUsd(-g.dollarCost)} × ${g.tradeCount}`);
  }
}
