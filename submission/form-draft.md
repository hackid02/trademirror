# TradeMirror · Form answer drafts (edit before submitting)

## Project Description, part 1 · Thesis (highest weight)

PnL charts show *what* happened; nothing tells a retail trader *why money bled*.
Weekend spread traps, revenge tilt after losses, cutting winners while nursing losers,
off-hours overtrading — these behavioral leaks hide inside aggregate PnL, so traders
fix the strategy when the routine is the problem. TradeMirror's hypothesis: if you
price each bias in dollars, model the counterfactual clean-PnL path, and convert the
findings into deployable guardrails, review becomes the highest-ROI trade a retail
account can make.

## Part 2 · Target user and product value

Retail discretionary traders on crypto perps / tokenized US stocks (rTokens) with
$2k–$50k accounts, trading 10+ times a week, who suspect fees, spreads, and tilt —
not entries — are the leak. Concrete persona: the weekend rToken scalper who bleeds
on Sat/Sun session illiquidity and revenge-trades drawdowns. They get: a behavioral
score + archetype, dollar-attributed bias taxonomy, an "actual vs disciplined" twin
curve, a natural-language audit they can interrogate, and armed guardrails
(weekend lockouts, tilt circuit-breakers) shaped for Agent Hub / Playbook deployment.

## Part 3 · Validation data and key metrics (labeled)

Observed on seeded, reproducible personas (deterministic engine, no LLM in the loop):
Weekend rToken Chaser — 44 trades, score 64/C, leak −$2,857.54 of −$3,501.79 net
(Sharpe −4.89, win rate 29.5%); Revenge Scalper — 40 trades, 51/D; Disciplined Pro —
54 trades, 96/A, $0 leak. Engine checks: 23/23 edge-case fuzz clean, two Playwright
sweeps green (tour, citations, toggles, export, theme, reduced-motion), zero console
errors. Targeted: 50 real UTA v3 uploads in month one; guardrail-armed cohorts
cutting weekend leak ≥30% (tracked via re-audit delta). No live-user data yet —
validation plan is re-audit deltas + guardrail adherence on real uploads.

## Part 4 · Progress

Built: 7-stage pipeline (recover→export), 4-detector engine (weekend-spread,
premature-exit, revenge-tilt, off-hours), counterfactual twin chart, session
heatmap, LUI ask-with-citations, 16-step guided tour, defense guardrail array,
share/export cards, UTA v3 CSV/JSON upload. Stack: Next.js + TypeScript + Tailwind,
`qwen3.8-max` via the hackathon gateway for narrative synthesis (strict-JSON,
validated, deterministic fallback when no key). Not built: live-Qwen narratives in
the public demo (pending credits), guardrail adherence tracking, additional bias
rules. Next: credits → live synthesis; adherence loop; Playbook listing review.

## Part 5 · Deliverables

Live demo URL, public GitHub repo, 2-min screen recording (tour → ask → guardrails →
export), in-app 60-sec guided tour as the research-task walkthrough.

## Part 6 · Take on AI trading (optional)

The winning pattern for Track 3 is rules-first, LLM-second: deterministic attribution
earns the trader's trust, the model only narrates and answers over cited evidence.
Anything the LLM says must survive with the LLM removed — ours does (fallback).

## Role of the LLM in Your Project (separate field)

Product: `qwen3.8-max` (hackathon gateway) synthesizes executive summaries and
answers over engine-computed evidence; outputs are strict-JSON validated and every
claim must cite order IDs — with no key, a deterministic fallback narrates instead,
so the desk is fully usable unkeyed. (No Qwen build credits received; skipping the
credits section per FAQ.) Build: AI coding assistants generated the codebase
(pure-vibecode workflow) under human review; all displayed numbers come from the
deterministic engine or seeded fixtures, never from model output.
