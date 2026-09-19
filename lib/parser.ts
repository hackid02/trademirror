// ─── TradeMirror · UTA v3 Upload Parser ──────────────────────────────────────
// Accepts drag-and-dropped CSV or JSON exports and normalises them into
// BitgetTradeLog rows. Lenient by design: best-effort coercion + error report.
// Hard rejects (bad symbol/time/notional, negative fee) skip the row; soft
// anomalies (future timestamps, fee > notional, negative holds) warn and keep it.

import type { AssetType, BitgetTradeLog, CloseReason, OrderType, Side } from './types';

export interface ParseResult {
  trades: BitgetTradeLog[];
  errors: string[];
  warnings: string[];
  skippedRows: number;
  fileName: string;
}

const RTOKEN_HINTS = [
  'rNVDA', 'rTSLA', 'rAAPL', 'rMSFT', 'rAMZN', 'rGOOG', 'rMETA', 'rAMD', 'rCOIN',
  'rNFLX', 'rAVGO', 'rPLTR', 'rMSTR', 'rHOOD', 'rSMCI', 'rCRM', 'rORCL',
];

export function inferAssetType(symbol: string): AssetType {
  const s = symbol.toUpperCase();
  if (RTOKEN_HINTS.some((h) => s.startsWith(h.toUpperCase()))) return 'rToken';
  // rXXXUSDT pattern (tokenised equity) — tested against the normalised form so
  // fully-uppercased exchange exports classify the same as mixed-case ones.
  if (/^R[A-Z]{1,6}USDT$/.test(s)) return 'rToken';
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

// Strict variant: distinguishes "absent" (caller decides the default) from
// "present but unparseable" (null → the row must error, never silently become 0).
function numStrict(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
  return 'buy'; // display-only default; side feeds one narrative template, no rule math
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

function rowToTrade(
  row: Record<string, unknown>,
  idx: number,
): { trade: BitgetTradeLog | null; error?: string; warnings: string[] } {
  const warnings: string[] = [];
  const tag = `row ${idx + 1}`;
  // header-agnostic lookup
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = v;
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) if (lower[k] !== undefined && lower[k] !== '') return lower[k];
    return undefined;
  };

  const symbol = String(pick('symbol', 'pair', 'instrument', 'market') ?? '').trim();
  if (!symbol) return { trade: null, error: `${tag}: missing symbol`, warnings };

  const ts = parseTimestamp(pick('timestamp', 'time', 'closetime', 'filltime', 'date', 'exittime'));
  if (ts === null) return { trade: null, error: `${tag}: unparseable timestamp`, warnings };
  if (ts > Date.now()) warnings.push(`${tag}: timestamp is in the future`);

  const fillPrice = num(pick('fillprice', 'price', 'avgprice', 'exitprice', 'closeprice'));
  const size = num(pick('size', 'qty', 'quantity', 'amount'));
  let notionalUsd = num(pick('notionalusd', 'notional', 'usdt', 'value', 'turnover'));
  if (!notionalUsd && fillPrice && size) notionalUsd = fillPrice * size;
  if (!notionalUsd) return { trade: null, error: `${tag}: missing notional/size/price`, warnings };
  if (notionalUsd < 0) return { trade: null, error: `${tag}: notional must be positive`, warnings };

  const rawPnl = pick('realizedpnl', 'pnl', 'profit', 'closedpnl', 'netpnl');
  let realizedPnl = 0;
  if (rawPnl !== undefined) {
    const n = numStrict(rawPnl);
    if (n === null) return { trade: null, error: `${tag}: unparseable realizedPnl`, warnings };
    realizedPnl = n;
  }
  const fee = num(pick('fee', 'fees', 'commission'));
  if (fee < 0) return { trade: null, error: `${tag}: fee must be ≥ 0`, warnings };
  if (fee > notionalUsd) warnings.push(`${tag}: fee exceeds notional`);
  const rawHold = pick('holddurationseconds', 'holdduration', 'holdsec', 'durationsec', 'duration');
  const holdDurationSeconds = Math.max(0, Math.round(num(rawHold)));
  if (rawHold !== undefined && num(rawHold) < 0) {
    warnings.push(`${tag}: negative hold duration clamped to 0`);
  }

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
  return { trade, warnings };
}

// Quote-aware record splitter: tracks quote state across newlines (RFC 4180
// permits embedded newlines; Excel emits them), so a quoted multi-line cell
// stays one record. Fully-blank records are dropped.
function splitCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const pushCell = (): void => {
    row.push(cur);
    cur = '';
  };
  const pushRow = (): void => {
    if (row.some((c) => c.trim() !== '')) records.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') pushCell();
    else if (ch === '\n') {
      pushCell();
      pushRow();
    } else if (ch === '\r') {
      // skip — \r\n line endings break on the \n
    } else cur += ch;
  }
  pushCell();
  pushRow();
  return records;
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
  const records = splitCsvRecords(text);
  if (records.length < 2) {
    return { trades: [], errors: ['CSV needs a header row plus at least one trade row'], warnings: [], skippedRows: 0, fileName };
  }
  const headers = records[0];
  const trades: BitgetTradeLog[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  let errTruncated = false;
  let warnTruncated = false;
  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? '';
    });
    const { trade, error, warnings: rowWarnings } = rowToTrade(row, i);
    if (trade) trades.push(trade);
    else if (error) {
      skippedRows += 1;
      // Cap the *report*, never the ingestion — every record is still attempted.
      if (errors.length < 25) errors.push(error);
      else if (!errTruncated) {
        errors.push('…showing first 25 row errors');
        errTruncated = true;
      }
    }
    for (const w of rowWarnings) {
      if (warnings.length < 10) warnings.push(w);
      else if (!warnTruncated) {
        warnings.push('…showing first 10 warnings');
        warnTruncated = true;
      }
    }
  }
  return { trades, errors, warnings, skippedRows, fileName };
}

export function parseJson(text: string, fileName: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { trades: [], errors: ['Invalid JSON — file could not be parsed'], warnings: [], skippedRows: 0, fileName };
  }
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.trades)
      ? ((raw as Record<string, unknown>).trades as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.data)
        ? ((raw as Record<string, unknown>).data as unknown[])
        : [];
  if (rows.length === 0) {
    return { trades: [], errors: ['JSON must be an array of trades, or { trades: [...] } / { data: [...] }'], warnings: [], skippedRows: 0, fileName };
  }
  const trades: BitgetTradeLog[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  let errTruncated = false;
  let warnTruncated = false;
  rows.forEach((r, i) => {
    if (typeof r !== 'object' || r === null) {
      skippedRows += 1;
      if (errors.length < 25) errors.push(`row ${i + 1}: not an object`);
      else if (!errTruncated) {
        errors.push('…showing first 25 row errors');
        errTruncated = true;
      }
      return;
    }
    const { trade, error, warnings: rowWarnings } = rowToTrade(r as Record<string, unknown>, i);
    if (trade) trades.push(trade);
    else if (error) {
      skippedRows += 1;
      if (errors.length < 25) errors.push(error);
      else if (!errTruncated) {
        errors.push('…showing first 25 row errors');
        errTruncated = true;
      }
    }
    for (const w of rowWarnings) {
      if (warnings.length < 10) warnings.push(w);
      else if (!warnTruncated) {
        warnings.push('…showing first 10 warnings');
        warnTruncated = true;
      }
    }
  });
  return { trades, errors, warnings, skippedRows, fileName };
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
