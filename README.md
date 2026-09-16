# 🪞 TradeMirror — Behavioral Audit Workbench

**Bitget AI Base Camp Hackathon S2 · Track 3: AI Trading Desk · Sub-theme: Review & Self-Evolution**

> PnL charts show *what* happened. TradeMirror diagnoses *why money bled* — weekend
> spread traps, revenge tilt, disposition asymmetry, off-hours overtrading — prices each
> bias in dollars, models the counterfactual clean-PnL path, and emits deployable
> defense guardrails for Agent Hub / Playbook.

Demo personas run with **zero setup** (no API keys). Upload any Bitget UTA v3
CSV/JSON export to audit a real flow.

## Research task (Track 3 contract)

- **Question:** “Why did this flow bleed — and what exactly would discipline have been worth?”
- **Method:** client-side deterministic heuristics (4 rules) + optional `qwen3.8-max` synthesis
- **Insight:** dollar-attributed bias taxonomy + counterfactual PnL + armed guardrail checklist

## Stack

- Next.js 14+ (App Router) · TypeScript · Tailwind v4
- Deterministic engine: `lib/engine.ts` (pure TS, timed in header, ~0.4ms)
- Personas: `lib/mockProfiles.ts` (seeded, reproducible)
- Upload parser: `lib/parser.ts` (CSV/JSON, header-agnostic)
- LLM proxy: `app/api/audit/route.ts` → `https://hackathon.bitgetops.com/v1` (`qwen3.8-max`, strict JSON, validated + fallback)

## Run

```bash
npm install
cp .env.example .env.local   # optional: add BITGET_QWEN_API_KEY for live LLM
npm run dev                  # → http://localhost:3000
```

## Deploy (Vercel — submission demo link)

```bash
npm run build
vercel --prod                 # or import the repo in vercel.com → Deploy
```

Set `BITGET_QWEN_API_KEY` in Vercel → Project → Settings → Environment Variables
(optional but recommended for the live-Qwen judging path).

## The 4 heuristic rules

| Rule | Trigger | Leak math |
|---|---|---|
| `LEAK_WEEKEND_RTOKEN` | rToken + market + NYSE closed | 0.50% × notional |
| `LEAK_REVENGE_TILT` | entry ≤15m after a loss at ≥1.4× avg size | full loss if red |
| `LEAK_DISPOSITION_ASYMMETRY` | win/loss hold ratio < 0.25, winners clipped <30m | 1.5× realized gain (opportunity) |
| `LEAK_EXHAUSTION_CLUSTER` | ≥6 trades/2h with fees > gross wins | fee + 25% of loss slice |

## Submission checklist (before Sept 21, 2026 UTC+8)

- [ ] Track: 🟧 Track 3 · AI Trading Desk → Sub-theme: **Review & Self-Evolution**
- [ ] Project name: **TradeMirror**
- [ ] [Google Form](https://forms.gle/GyWZCMCPocgJdJon6): 6-part description + Role of LLM + materials link
- [ ] Materials: Vercel demo URL + this repo + (optional) screen recording
- [ ] X post with `#BitgetHackathon` + `@Bitget_AI` (+ retweet the official post) — use the in-app **Copy brief for X** button
- [ ] University name filled (if eligible) · Demo Day checked · K3 subsidy checked

## Links

- Activity hub: https://www.bitget.com/activity-hub/hackathon
- Developer guide: https://bitget-ai.gitbook.io/bitgetai_hackathons2
- Agent Hub: https://github.com/BitgetLimited/agent_hub
- Submit: https://forms.gle/GyWZCMCPocgJdJon6
