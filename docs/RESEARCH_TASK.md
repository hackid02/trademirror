# TradeMirror · Complete research task (Track 3 requirement)

One full flow, question → actionable insight, reproducible on the live demo
(`https://trademirror-btgt.vercel.app`, default persona **Weekend rToken Chaser**,
44 seeded UTA v3 trades). This is the task the in-app 60-sec guided tour walks.

## 1 · Question

> "I lost −$3,501.79 this month. Was it my strategy — or my behavior? And what
> exactly do I change next week?"

## 2 · Method (rules-first, LLM-second)

1. **Ingest** — UTA v3 CSV/JSON parsed 100% in-browser; every row validated
   (bad rows rejected with reasons, never silently zeroed).
2. **Detect** — 4 deterministic detectors scan the flow: weekend rToken spread
   trap, revenge-tilt sizing, premature profit clipping, off-hours exhaustion
   clusters. Each flag carries dollar cost + trigger evidence + narrative.
3. **Attribute** — leak priced per bias, per trade, per weekday×hour session;
   counterfactual clean-PnL curve shows the "disciplined twin" path.
4. **Interrogate** — Ask Mirror answers in natural language, strictly from the
   logged trades, citing order IDs as receipts.
5. **Arm** — findings convert to toggleable guardrails with Agent Hub /
   Playbook deploy targets; disarming one recomputes the clean curve live.

## 3 · Evidence (observed, deterministic — no LLM in the numbers)

- Behavioral score **67/C**, archetype **Weekend Liquidity Donor**.
- Total leak **−$2,508.92** of −$3,501.79 net (−$992.87 disciplined-twin PnL).
- Weekend spread: −$930.61 (37%); premature exits: −$838.35 (33%);
  revenge tilt: −$739.96 (29%). 31 flags over 21 receipts.
- **Sat+Sun = 94% of leak**; worst cell **Sun 08:00Z** (−$1,198.29).
- Winners held 13 min vs losers 4.3 h (disposition ratio 0.05).

## 4 · Insight (the answer to the question)

It was behavior, not strategy: nearly all red came from trading rTokens while
NYSE was closed, re-entering within minutes of losses at 1.4×+ size, and
clipping winners in minutes while nursing losers for hours. Discipline alone
was worth **+$2,508.92** — no new signal required.

## 5 · Action (reusable checklist → deployable guardrails)

- **Rule-W01 · Hard Lockout** — block rToken market orders while NYSE closed
  (top save: $930.61) → Agent Hub.
- **Rule-T02 · 30m Cooldown** — freeze entries 30 min after any closed loss,
  cap next size at 1.1× trailing average → Agent Hub + Playbook.
- **Rule-H03 · Trailing Ratchet** — 45-min time-stop + 1R trailing ratchet on
  winners → Playbook.
- Re-audit weekly: score delta + weekend-leak delta prove the guardrails hold.

## 6 · Where judges see each step

| Step | Live demo |
|---|---|
| Score + archetype + leak mix | Scorecard (`#score`) |
| Actual vs disciplined-twin curve | Counterfactual chart (`#curve`) |
| When the leak happens | Session heatmap (`#heatmap`) |
| Cited natural-language answers | Ask Mirror (`#ask`) |
| Guardrails + what-if toggles | Defense plan (`#defense`) |
| Receipt-level evidence | Forensic log (`#log`) |
| Full narrated path | 60-sec guided tour (FAB, all 8 stops) |
