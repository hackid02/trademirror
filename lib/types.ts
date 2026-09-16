// ─── TradeMirror · Shared Types ──────────────────────────────────────────────
// Track 3: AI Trading Desk · Sub-theme: Review & Self-Evolution

export type AssetType = 'rToken' | 'crypto_perp' | 'spot';
export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type CloseReason = 'stop_loss' | 'take_profit' | 'manual_panic' | 'limit_exit';

export type LeakTag =
  | 'WEEKEND_SPREAD'
  | 'REVENGE_TILT'
  | 'PREMATURE_EXIT'
  | 'LOSS_AVERSION'
  | 'EXHAUSTION_CLUSTER';

export interface BitgetTradeLog {
  orderId: string;
  symbol: string; // e.g. "rNVDAUSDT", "BTCUSDT"
  assetType: AssetType;
  side: Side;
  orderType: OrderType;
  fillPrice: number;
  size: number;
  notionalUsd: number; // fillPrice * size
  realizedPnl: number; // closed PnL in USDT (0 for opens)
  fee: number; // trading fee in USDT
  timestamp: number; // epoch milliseconds
  holdDurationSeconds: number;
  closeReason?: CloseReason;
}

export interface LeakFlag {
  tradeIndex: number;
  orderId: string;
  tag: LeakTag;
  ruleId: string; // LEAK_WEEKEND_RTOKEN | LEAK_REVENGE_TILT | LEAK_DISPOSITION_ASYMMETRY | LEAK_EXHAUSTION_CLUSTER
  dollarCost: number; // estimated USD bled on this flag
  narrative: string; // human-readable root cause
  triggerDetail: string; // short machine-readable trigger evidence
}

export interface LeakGroup {
  tag: LeakTag;
  ruleId: string;
  biasName: string;
  dollarCost: number;
  tradeCount: number;
  pctOfLeak: number;
  rootCause: string;
  counterfactual: string;
}

export interface CurvePoint {
  i: number;
  time: number;
  label: string;
  actual: number; // cumulative realized net PnL
  clean: number; // cumulative behavior-filtered PnL
}

export interface TradeMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number; // 0..1
  grossWin: number;
  grossLoss: number; // negative number
  totalFees: number;
  netPnl: number; // Σ(realizedPnl - fee)
  volume: number; // Σ notional
  avgWin: number;
  avgLoss: number; // negative number
  avgWinHoldSec: number;
  avgLossHoldSec: number;
  dispositionRatio: number; // avgWinHold / avgLossHold
  profitFactor: number;
  sharpe: number; // per-trade Sharpe annualised-ish
  maxDrawdown: number; // negative number (on net curve)
  totalLeakUsd: number;
  cleanPnl: number; // netPnl + recovered leaks
  leakPctOfVolumeBps: number;
  score: number; // 0..100
  grade: string;
  archetype: string;
  revengeCount: number;
  weekendCount: number;
  prematureCount: number;
  clusterCount: number;
}

export interface AuditComputation {
  metrics: TradeMetrics;
  flags: LeakFlag[];
  groups: LeakGroup[];
  curve: CurvePoint[];
  flaggedOrderIds: Set<string>;
  leakByOrderId: Map<string, number>;
}

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  trades: BitgetTradeLog[];
}

export interface TopLeak {
  biasName: string;
  tag: LeakTag;
  dollarCost: number;
  tradeCount: number;
  rootCause: string;
  counterfactual: string;
}

export interface DefenseRule {
  ruleId: string;
  directive: string;
  rationale: string;
  triggerCondition: string;
  projectedSavingsUsd: number;
  deployTarget: 'agent-hub' | 'playbook' | 'both';
}

export interface QwenAudit {
  behavioralScore: number;
  letterGrade: string;
  psychologicalArchetype: string;
  executiveSummary: string;
  totalEstimatedLeakUsd: number;
  topLeaks: TopLeak[];
  defenseRules: DefenseRule[];
  shareableBlurb: string;
  confidence: number; // 0..1
  entropy: number; // 0..1 epistemic uncertainty
}

export interface AuditApiResponse {
  source: 'qwen' | 'mock';
  model: string;
  latencyMs: number;
  degraded?: boolean;
  audit: QwenAudit;
}
