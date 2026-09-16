// ─── TradeMirror · UTA v3 Upload Parser ──────────────────────────────────────
// Accepts drag-and-dropped CSV or JSON exports and normalises them into
// BitgetTradeLog rows. Lenient by design: best-effort coercion + error report.

import type { AssetType, BitgetTradeLog, CloseReason, OrderType, Side } from './types';

export interface ParseResult {
  trades: BitgetTradeLog[];
  errors: string[];
  fileName: string;
}

const RTOKEN_HINTS = [
  'rNVDA', 'rTSLA', 'rAAPL', 'rMSFT', 'rAMZN', 'rGOOG', 'rMETA', 'rAMD', 'rCOIN',
  'rNFLX', 'rAVGO', 'rPLTR', 'rMSTR', 'rHOOD', 'rSMCI', 'rCRM', 'rORCL',
];

export function inferAssetType(symbol: string): AssetType {
  const s = symbol.toUpperCase();
  if (RTOKEN_HINTS.some((h) => s.startsWith(h.toUpperCase()))) return 'rToken';
  // rXXXUSDT pattern (tokenised equity) — starts with lowercase r + uppercase ticker
  if (/^r[A-Z]{1,6}USDT$/.test(symbol)) return 'rToken';
  if (/USDT$/.test(s)) return 'crypto_perp';
  return 'spot';
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[$,\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function parseTimestamp(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 1e14) return Math.round(v / 1000); // microseconds → ms guard
    if (v < 1e12) return Math.round(v * 1000); // seconds → ms
    return Math.round(v);
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const t = Date.parse(v.trim());
    if (!Number.isNaN(t)) return t;
    const n = Number(v.trim());
    if (Number.isFinite(n)) return parseTimestamp(n);
  }
  return null;
}

function normSide(v: unknown): Side {
  const s = String(v ?? '').toLowerCase();
  if (s.startsWith('s') && (s.includes('sell') || s.includes('short') || s === 's')) return 'sell';
  return 'buy';
}

function normOrderType(v: unknown): OrderType {
  return String(v ?? '').toLowerCase().includes('limit') ? 'limit' : 'market';
}

function normCloseReason(v: unknown): CloseReason | undefined {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('stop')) return 'stop_loss';
  if (s.includes('take') || s.includes('profit')) return 'take_profit';
  if (s.includes('panic') || s.includes('manual')) return 'manual_panic';
  if (s.includes('limit') || s.includes('exit')) return 'limit_exit';
  return undefined;
}

function rowToTrade(row: Record<string, unknown>, idx: number): { trade: BitgetTradeLog | null; error?: string } {
  // header-agnostic lookup
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = v;
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) if (lower[k] !== undefined && lower[k] !== '') return lower[k];
    return undefined;
  };

  const symbol = String(pick('symbol', 'pair', 'instrument', 'market') ?? '').trim();
  if (!symbol) return { trade: null, error: `row ${idx + 1}: missing symbol` };

  const ts = parseTimestamp(pick('timestamp', 'time', 'closetime', 'filltime', 'date', 'exittime'));
  if (ts === null) return { trade: null, error: `row ${idx + 1}: unparseable timestamp` };

  const fillPrice = num(pick('fillprice', 'price', 'avgprice', 'exitprice', 'closeprice'));
  const size = num(pick('size', 'qty', 'quantity', 'amount'));
  let notionalUsd = num(pick('notionalusd', 'notional', 'usdt', 'value', 'turnover'));
  if (!notionalUsd && fillPrice && size) notionalUsd = fillPrice * size;
  if (!notionalUsd) return { trade: null, error: `row ${idx + 1}: missing notional/size/price` };
  if (notionalUsd < 0) return { trade: null, error: `row ${idx + 1}: notional must be positive` };

  const realizedPnl = num(pick('realizedpnl', 'pnl', 'profit', 'closedpnl', 'netpnl'));
  const fee = num(pick('fee', 'fees', 'commission'));
  const holdDurationSeconds = Math.max(
    0,
    Math.round(num(pick('holddurationseconds', 'holdduration', 'holdsec', 'durationsec', 'duration'))),
  );

  const trade: BitgetTradeLog = {
    orderId: String(pick('orderid', 'id', 'order_id', 'tradeid') ?? `UPLOAD-${idx + 1}`).trim(),
    symbol,
    assetType: inferAssetType(symbol),
    side: normSide(pick('side', 'direction')),
    orderType: normOrderType(pick('ordertype', 'type')),
    fillPrice,
    size: size || notionalUsd / Math.max(fillPrice, 1e-9),
    notionalUsd,
    realizedPnl,
    fee,
    timestamp: ts,
    holdDurationSeconds,
    closeReason: normCloseReason(pick('closereason', 'reason', 'exitreason')),
  };
  return { trade };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string, fileName: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { trades: [], errors: ['CSV needs a header row plus at least one trade row'], fileName };
  const headers = splitCsvLine(lines[0]);
  const trades: BitgetTradeLog[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? '';
    });
    const { trade, error } = rowToTrade(row, i);
    if (trade) trades.push(trade);
    else if (error) errors.push(error);
    if (errors.length > 25) {
      errors.push('…stopping error report after 25 rows');
      break;
    }
  }
  return { trades, errors, fileName };
}

export function parseJson(text: string, fileName: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { trades: [], errors: ['Invalid JSON — file could not be parsed'], fileName };
  }
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.trades)
      ? ((raw as Record<string, unknown>).trades as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.data)
        ? ((raw as Record<string, unknown>).data as unknown[])
        : [];
  if (rows.length === 0) {
    return { trades: [], errors: ['JSON must be an array of trades, or { trades: [...] } / { data: [...] }'], fileName };
  }
  const trades: BitgetTradeLog[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (typeof r !== 'object' || r === null) {
      errors.push(`row ${i + 1}: not an object`);
      return;
    }
    const { trade, error } = rowToTrade(r as Record<string, unknown>, i);
    if (trade) trades.push(trade);
    else if (error) errors.push(error);
  });
  return { trades, errors, fileName };
}

export function parseUpload(text: string, fileName: string): ParseResult {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return parseJson(text, fileName);
  if (lower.endsWith('.csv')) return parseCsv(text, fileName);
  // sniff
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return parseJson(text, fileName);
  return parseCsv(text, fileName);
}

// Sample template so users can see the expected UTA v3 shape
export const CSV_TEMPLATE = `orderId,symbol,side,orderType,fillPrice,size,notionalUsd,realizedPnl,fee,timestamp,holdDurationSeconds,closeReason
demo-001,rNVDAUSDT,buy,market,186.40,25,4660.00,-84.20,2.33,2026-08-15T14:05:00Z,12600,manual_panic
demo-002,BTCUSDT,sell,limit,112400,0.05,5620.00,96.50,2.81,2026-08-17T15:40:00Z,900,take_profit
`;
