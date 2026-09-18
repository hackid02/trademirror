# TradeMirror · Adversarial QA mission (paste into Claude)

> You are an adversarial QA engineer + security-minded code reviewer. Goal: break
> TradeMirror, find every bug, and report them by severity. Do NOT push or commit —
> report only. Ask before changing any behavior.

## 0. Setup

```bash
git clone https://github.com/hackid02/trademirror && cd trademirror
node --version   # need 20+
npm install && npm run build && npm start -- --port 3000 --hostname 0.0.0.0
```

Key map: deterministic engine `lib/engine.ts` · upload parser `lib/parser.ts` ·
personas `lib/mockProfiles.ts` · UI `components/*.tsx` + `app/page.tsx` ·
API `app/api/{tickers,ask,audit}/route.ts` · checks `scripts/check.ts`,
`scripts/verify.ts` · browser sweeps `../preview/qa-sweep*.js` (need `playwright`).

## 1. Run the existing battery (all must pass)

1. `npx tsc --noEmit` → 0 errors
2. `npx tsx scripts/check.ts` → expect `64/C · 51/D · 96/A`, no NaN
3. `npx tsx scripts/verify.ts` → pass
4. `npx playwright install chromium && node ../preview/qa-sweep.js` → ERRORS:0
5. `node ../preview/qa-sweep2.js` → ERRORS:0

## 2. Parser stress (use + extend `test-data/`)

- `test-data/synthetic-uta-v3.csv` (64 trades, seeded biases) must ingest 64/64,
  audit to 57/C−, 27 flags. Upload it through the UI too (Template → Upload flow).
- Invent malformed files and confirm graceful handling (row errors listed, never a
  crash/blank page): empty file · header-only · wrong headers · negative/zero
  notionals · negative fees · reversed timestamps · 5,000-row file (time it) ·
  unicode/emoji symbols · `=cmd|...` formula-injection strings in text cells ·
  duplicate orderIds · future timestamps · absurd values (price 1e18, fee > notional).

## 3. Bug hunt (app + code)

- **Correctness:** hand-verify one persona's score/leak/clean-PnL against the engine
  source. Check grade-band boundaries (49/50/54/55/59/60/69/70/…).
- **Hydration:** cold-load with JS console open — zero React #418/#425 errors.
  Pay attention to anything time-derived on first render.
- **XSS:** CSV text (orderId/symbol) reaches the DOM — confirm React escaping, no
  `dangerouslySetInnerHTML` on user-derived strings.
- **Error paths:** block `/api/tickers`, `/api/ask`, `/api/audit` (one at a time) —
  UI must degrade to labeled fallback states, never spin forever or blank.
- **State:** switch personas mid-tour · upload mid-tour · toggle all guardrails off/on
  (clean curve must recompute) · theme persists across reload · back-to-top · mobile
  390px (segmented nav, no horizontal overflow) · `prefers-reduced-motion`.
- **A11y:** keyboard-only tour completion · all icon-buttons named · form inputs labeled.
- **Sensitive data:** confirm upload parsing is 100% client-side (no file bytes POSTed);
  confirm no secrets in repo (`BITGET_QWEN_API_KEY` must only appear in `.env.example`).

## 4. Report format (strict)

For each finding: `P0` (wrong money math / crash / data leak) · `P1` (broken
feature / wrong display) · `P2` (polish / a11y nit) — with repro steps, expected
vs actual, `file:line`, and a suggested fix. End with a one-line verdict:
`SHIP` / `SHIP-WITH-FIXES` / `DO-NOT-SHIP`.
