# TradeMirror · Submission checklist (Bitget S2 · Track 3: AI Trading Desk)

Sub-theme: **Review & Self-Evolution** · Deadline: **Sept 21, 2026 24:00 UTC+8**
Form: https://forms.gle/GyWZCMCPocgJdJon6 · Handbook: https://bitget-ai.gitbook.io/bitgetai_hackathons2

## Materials (all links go in the form's "Submission Materials Link" field)

- [ ] GitHub repo (public): `https://github.com/<you>/trademirror`
- [ ] Live demo (Vercel): `https://<project>.vercel.app` — verify cold load + tour + ask + export
- [ ] Screen recording (optional, recommended): 2-min walkthrough per `docs/DEMO.md` (unlisted YouTube / Loom)
- [ ] X post link goes in its own form field, NOT here

## X post (required — missing = invalid submission)

- [ ] Substantive post introducing TradeMirror (dev log / demo showcase, not a bare retweet)
- [ ] Contains `#BitgetHackathon` + `@Bitget_AI`
- [ ] Retweet the official hackathon post (link from Telegram/form page)

## Google Form

- [ ] Project Description: 6 parts (draft in `submission/form-draft.md`)
  - Target user must be a **concrete segment** — "all traders" is rejected
  - Metrics labeled observed / estimated / targeted
- [ ] Role of the LLM: draft in `submission/form-draft.md` (no Qwen credits → skip Qwen part, no penalty)
- [ ] Track → Sub-theme: AI Trading Desk → Review & Self-Evolution
- [ ] Apply for Demo Day: **Yes**
- [ ] Apply for K3 Token Subsidy: **Yes**
- [ ] University Name: fill in if eligible (extra 10×500 pool, mutually exclusive with main prizes)

## Pre-submit verification

- [ ] `npm run build` green on the pushed commit
- [ ] Live demo cold-loads with zero console errors; tour completes; ask returns cited answer
- [ ] No secrets in repo (`.env.example` only documents var names; key stays in Vercel env if ever added)
