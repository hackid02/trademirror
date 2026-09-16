'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header';
import FlowSelector from '@/components/FlowSelector';
import MarketBar from '@/components/MarketBar';
import Pipeline, { type BriefState } from '@/components/Pipeline';
import Scorecard from '@/components/Scorecard';
import CounterfactualChart from '@/components/CounterfactualChart';
import BiasTaxonomy from '@/components/BiasTaxonomy';
import ForensicLog, { type SessionFilter } from '@/components/ForensicLog';
import DefensePlan from '@/components/DefensePlan';
import DetectorRoster from '@/components/DetectorRoster';
import ExportBar from '@/components/ExportBar';
import { buildXBrief } from '@/lib/brief';
import AskMirror, { type AskAction, type AskPayload } from '@/components/AskMirror';
import LeakHeatmap, { type SessionCell } from '@/components/LeakHeatmap';
import JudgeTour, { TourFab, type TourStep } from '@/components/JudgeTour';
import { Reveal } from '@/components/motion';
import { Card } from '@/components/ui';
import { fmtUsd, runAudit } from '@/lib/engine';
import { ENGINE_RULE_IDS, computeCleanCurveWithRules, computeSparkSeries } from '@/lib/analysis';
import { buildPersonas } from '@/lib/mockProfiles';
import { CSV_TEMPLATE, parseUpload } from '@/lib/parser';
import { renderShareCard } from '@/lib/shareCard';
import type { AuditApiResponse, BitgetTradeLog, LeakTag, QwenAudit } from '@/lib/types';

function download(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TOUR_STEPS: TourStep[] = [
  { tour: 'personas', title: 'Pick a flow — zero setup', body: 'Three seeded UTA v3 personas load instantly. No API keys, no wallets. Or upload your own CSV/JSON export.' },
  { tour: 'score', title: 'The verdict, in one glance', body: 'Behavioral score, grade, and psychological archetype — computed deterministically from 4 leak rules, in under a millisecond.' },
  { tour: 'curve', title: 'Actual vs behavior-filtered PnL', body: 'The counterfactual twin: your real equity path against the path discipline would have taken. Click any dot for its receipt.' },
  { tour: 'heatmap', title: 'When the leak happens', body: 'Weekday × hour leak attribution. Click a cell to filter the forensic log to that exact session.' },
  { tour: 'ask', title: 'Interrogate the audit', body: 'Ask Mirror answers in plain English, strictly from your logged trades, and cites order IDs as receipts. Try a chip below — or a suggested action.' },
  { tour: 'defense', title: 'Arm the guardrails', body: 'Qwen turns each bias into a deployable rule. Toggle one — here or in the detector roster — and watch the clean curve above recompute live.' },
  { tour: 'log', title: 'Receipt-level forensics', body: 'Every flagged tick expandable: trigger evidence, narrative, dollar cost. This row was cited by the tour.' },
  { tour: 'export', title: 'Ship it', body: 'Share-card PNG + X brief for virality, UTA JSON for evidence, guardrail pack for Agent Hub / Playbook deployment.' },
];

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function TradeMirrorPage() {
  const personas = useMemo(() => buildPersonas(), []);
  const [activeId, setActiveId] = useState(personas[0].id);
  const [custom, setCustom] = useState<{ name: string; trades: BitgetTradeLog[] } | null>(null);
  // NOTE: defaults must match the server render exactly (hydration safety).
  // Stored prefs are adopted post-mount in the sync effect below.
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [guided, setGuided] = useState<boolean>(false);

  const [audit, setAudit] = useState<QwenAudit | null>(null);
  const [auditSource, setAuditSource] = useState<'qwen' | 'mock'>('mock');
  const [auditLatency, setAuditLatency] = useState(0);
  const [auditDegraded, setAuditDegraded] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);

  const [armed, setArmed] = useState<string[]>([...ENGINE_RULE_IDS]);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourSeen, setTourSeen] = useState<boolean>(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<SessionFilter | null>(null);
  const [tagFilter, setTagFilter] = useState<LeakTag | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activePersona = personas.find((p) => p.id === activeId) ?? personas[0];
  const trades = custom?.trades ?? activePersona.trades;
  const personaName = custom ? custom.name : activePersona.name;

  // Deterministic engine (pure — SSR/client identical)
  const comp = useMemo(() => runAudit(trades), [trades]);
  // Engine timing for the pipeline status rail, measured post-hydration so the
  // server render never disagrees with the client. Re-run is intentional: it
  // measures this browser's engine (trivial cost at ≤54 trades).
  const [engineMs, setEngineMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    runAudit(trades);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-sync measurement; render-phase timing would SSR/client-mismatch
    setEngineMs(performance.now() - t0);
  }, [trades]);

  // What-if curve: only armed guardrails recover leak
  const whatIf = useMemo(
    () => computeCleanCurveWithRules(trades, comp.flags, new Set(armed)),
    [trades, comp.flags, armed],
  );

  const sparks = useMemo(
    () => computeSparkSeries(trades, comp.curve, comp.leakByOrderId),
    [trades, comp.curve, comp.leakByOrderId],
  );

  const toggleRule = useCallback((engineRuleId: string) => {
    setArmed((prev) =>
      prev.includes(engineRuleId) ? prev.filter((r) => r !== engineRuleId) : [...prev, engineRuleId],
    );
  }, []);

  const onArmAll = useCallback((arm: boolean) => {
    setArmed(arm ? [...ENGINE_RULE_IDS] : []);
  }, []);

  const personaTabs = useMemo(
    () =>
      personas.map((p) => {
        const r = runAudit(p.trades);
        return {
          id: p.id,
          name: p.name,
          netPnl: r.metrics.netPnl,
          score: r.metrics.score,
          grade: r.metrics.grade,
          leak: r.metrics.totalLeakUsd,
          totalTrades: r.metrics.totalTrades,
        };
      }),
    [personas],
  );

  const flagsByOrder = useMemo(() => {
    const m = new Map<string, typeof comp.flags>();
    for (const f of comp.flags) {
      const arr = m.get(f.orderId) ?? [];
      arr.push(f);
      m.set(f.orderId, arr);
    }
    return m;
  }, [comp]);

  // Adopt pre-paint theme + stored prefs after mount (keeps SSR/client identical)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-sync from DOM/localStorage; lazy init would SSR/client-mismatch
    if (document.documentElement.getAttribute('data-theme') === 'light') setTheme('light');
    if (readStored('tm-guided') === '1') setGuided(true);
    if (readStored('tm-tour-seen') === '1') setTourSeen(true);
  }, []);

  // Theme → <html data-theme> (+ persist the manual toggle)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('tm-theme', theme);
    } catch {
      /* private mode — theme just won't persist */
    }
  }, [theme]);

  // Persist guided / full-desk view
  useEffect(() => {
    try {
      window.localStorage.setItem('tm-guided', guided ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [guided]);

  const auditPayload = useCallback(
    () => ({
      personaName,
      metrics: {
        totalTrades: comp.metrics.totalTrades,
        winRate: comp.metrics.winRate,
        netPnl: Math.round(comp.metrics.netPnl * 100) / 100,
        cleanPnl: Math.round(comp.metrics.cleanPnl * 100) / 100,
        grossWin: Math.round(comp.metrics.grossWin * 100) / 100,
        grossLoss: Math.round(comp.metrics.grossLoss * 100) / 100,
        totalFees: Math.round(comp.metrics.totalFees * 100) / 100,
        volume: Math.round(comp.metrics.volume),
        sharpe: Math.round(comp.metrics.sharpe * 100) / 100,
        maxDrawdown: Math.round(comp.metrics.maxDrawdown * 100) / 100,
        dispositionRatio: Math.round(comp.metrics.dispositionRatio * 100) / 100,
        revengeCount: comp.metrics.revengeCount,
        weekendCount: comp.metrics.weekendCount,
      },
      groups: comp.groups.map((g) => ({
        tag: g.tag,
        biasName: g.biasName,
        dollarCost: Math.round(g.dollarCost * 100) / 100,
        tradeCount: g.tradeCount,
        rootCause: g.rootCause,
        counterfactual: g.counterfactual,
      })),
      score: comp.metrics.score,
      grade: comp.metrics.grade,
      archetype: comp.metrics.archetype,
    }),
    [comp, personaName],
  );

  const runQwen = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAuditRunning(true);
    try {
      const samples = comp.flags.slice(0, 12).map((f) => {
        const t = trades[f.tradeIndex];
        return {
          orderId: f.orderId,
          symbol: t?.symbol ?? '?',
          side: t?.side ?? '?',
          pnl: t?.realizedPnl ?? 0,
          tag: f.tag,
          leakUsd: Math.round(f.dollarCost * 100) / 100,
          trigger: f.triggerDetail,
        };
      });
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auditPayload(), samples }),
        signal: ctrl.signal,
      });
      const data = (await res.json()) as AuditApiResponse;
      setAudit(data.audit);
      setAuditSource(data.source);
      setAuditLatency(data.latencyMs);
      setAuditDegraded(!!data.degraded);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setNotices((n) => [...n, 'Audit request failed — showing last good synthesis. Re-run to retry.']);
      }
    } finally {
      setAuditRunning(false);
    }
  }, [comp, trades, auditPayload]);

  // Auto-run synthesis whenever the flow changes (fast; mock fallback when offline)
  const flowKey = custom ? `custom:${custom.trades.length}:${custom.name}` : activeId;
  // Reset audit-stage state during render on flow change (React's blessed pattern
  // for "adjust state when props change" — no post-paint cascade, identical sequencing).
  const [lastFlow, setLastFlow] = useState(flowKey);
  if (flowKey !== lastFlow) {
    setLastFlow(flowKey);
    setAudit(null);
    setHighlight(null);
    setLogFilter(null);
    setTagFilter(null);
    setArmed([...ENGINE_RULE_IDS]);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch orchestration: state sets only after awaits resolve, never a sync cascade
    void runQwen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey]);

  // ── Ask Mirror context ────────────────────────────────────────────────────
  const getAskPayload = useCallback((): AskPayload => {
    const base = auditPayload();
    return {
      personaName: base.personaName,
      metrics: base.metrics,
      groups: base.groups.map((g) => ({ tag: g.tag, biasName: g.biasName, dollarCost: g.dollarCost, tradeCount: g.tradeCount })),
      flags: comp.flags.map((f) => {
        const t = trades[f.tradeIndex];
        return {
          orderId: f.orderId,
          symbol: t?.symbol ?? '?',
          side: t?.side ?? '?',
          pnl: t?.realizedPnl ?? 0,
          tag: f.tag,
          leakUsd: Math.round(f.dollarCost * 100) / 100,
          trigger: f.triggerDetail,
          narrative: f.narrative,
        };
      }),
      score: base.score,
      grade: base.grade,
      archetype: base.archetype,
    };
  }, [auditPayload, comp.flags, trades]);

  const onCite = useCallback((orderId: string) => {
    setHighlight(orderId);
    window.setTimeout(() => {
      document.getElementById(`log-${orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }, []);

  const onCellClick = useCallback((cell: SessionCell) => {
    setLogFilter((prev) => (prev?.dow === cell.dow && prev?.hour === cell.hour ? null : cell));
    window.setTimeout(() => {
      document.querySelector('[data-tour="log"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }, []);

  const onJump = useCallback((tour: string) => {
    document.querySelector(`[data-tour="${tour}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Header nav: guided mode hides the log — unfold the desk first when needed
  const onNav = useCallback(
    (tour: string) => {
      if (guided && tour === 'log') {
        setGuided(false);
        window.setTimeout(() => onJump(tour), 90);
      } else {
        onJump(tour);
      }
    },
    [guided, onJump],
  );

  const openTour = useCallback(() => {
    setGuided(false);
    setTourOpen(true);
    setTourSeen(true);
    try {
      window.localStorage.setItem('tm-tour-seen', '1');
    } catch {
      /* ignore */
    }
  }, []);

  const dismissTourNudge = useCallback(() => {
    setTourSeen(true);
    try {
      window.localStorage.setItem('tm-tour-seen', '1');
    } catch {
      /* ignore */
    }
  }, []);

  // Suggested actions — the LUI drives the desk, not just answers
  const askActions = useMemo<AskAction[]>(() => {
    const acts: AskAction[] = [];
    const top = [...comp.flags].sort((a, b) => b.dollarCost - a.dollarCost)[0];
    if (top) {
      acts.push({
        label: `Show biggest receipt ${top.orderId}`,
        hint: `${top.tag} · ${fmtUsd(-top.dollarCost)} leak — opens the full desk and jumps to the log`,
        onRun: () => {
          setGuided(false);
          window.setTimeout(() => onCite(top.orderId), 90);
        },
      });
    }
    acts.push(
      armed.length === ENGINE_RULE_IDS.length
        ? {
            label: 'Disarm all guardrails',
            hint: 'Flatten the clean curve to raw actual — the zero-discipline view',
            onRun: () => setArmed([]),
          }
        : {
            label: 'Arm all guardrails',
            hint: 'Restore the full-discipline clean curve',
            onRun: () => setArmed([...ENGINE_RULE_IDS]),
          },
    );
    acts.push({
      label: 'Jump to clean curve',
      hint: 'See the rule-validated what-if path',
      onRun: () => onJump('curve'),
    });
    return acts;
  }, [comp.flags, armed.length, onCite, onJump]);

  const brief: BriefState =
    auditRunning || !audit ? { mode: 'running' } : { mode: auditSource, ms: Math.round(auditLatency) };

  // ── upload ────────────────────────────────────────────────────────────────
  const onFile = async (f: File) => {
    const text = await f.text();
    const parsed = parseUpload(text, f.name);
    if (parsed.trades.length === 0) {
      setNotices([`Could not ingest ${f.name}:`, ...parsed.errors.slice(0, 6)]);
      return;
    }
    setCustom({ name: f.name.replace(/\.(csv|json)$/i, ''), trades: parsed.trades });
    const msgs = [`Ingested ${parsed.trades.length} trades from ${f.name}.`];
    if (parsed.errors.length > 0) msgs.push(`${parsed.errors.length} rows skipped (see console).`);
    console.warn('[TradeMirror] skipped rows:', parsed.errors);
    setNotices(msgs);
  };

  const xText = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
    return buildXBrief(comp.metrics, personaName, origin);
  }, [comp.metrics, personaName]);

  const fileStem = useMemo(
    () => `trademirror-${personaName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [personaName],
  );

  const exportJson = () => {
    download(
      `trademirror-${personaName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          app: 'TradeMirror/1.0 · Bitget AI Hackathon S2 · Track 3 AI Trading Desk · Review & Self-Evolution',
          persona: personaName,
          metrics: comp.metrics,
          groups: comp.groups,
          flags: comp.flags,
          armedGuardrails: armed,
          whatIfCleanPnl: Math.round(whatIf.cleanPnl * 100) / 100,
          qwenAudit: audit,
          trades,
        },
        null,
        2,
      ),
    );
  };

  const copyRules = async () => {
    if (!audit) return;
    const payload = {
      version: 'trademirror-rules/1.0',
      source: 'TradeMirror · Review & Self-Evolution',
      deployTargets: ['bitget-agent-hub', 'bitget-playbook'],
      generatedAt: new Date().toISOString(),
      guardrails: audit.defenseRules.map((r) => ({
        id: r.ruleId,
        deploy: r.deployTarget,
        if: r.triggerCondition,
        do: r.directive,
        why: r.rationale,
        projectedSavingsUsd: r.projectedSavingsUsd,
      })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      download('trademirror-guardrails.json', JSON.stringify(payload, null, 2));
    }
  };

  const renderCardBlob = (): Promise<Blob> => {
    const m = comp.metrics;
    return renderShareCard({
      persona: personaName,
      score: m.score,
      grade: m.grade,
      archetype: m.archetype,
      leakUsd: m.totalLeakUsd,
      netPnl: m.netPnl,
      cleanPnl: m.cleanPnl,
      totalTrades: m.totalTrades,
      winRate: m.winRate,
      url: typeof window !== 'undefined' ? window.location.href : '',
    });
  };

  const m = comp.metrics;

  return (
    <div className="min-h-screen">
      {/* ambient background */}
      <div className="bg-blueprint pointer-events-none fixed inset-0" aria-hidden />
      <div className="orb orb-a" aria-hidden />
      <div className="orb orb-b" aria-hidden />
      <div className="noise-layer" aria-hidden />

      <div className="relative z-[1]">
        <Reveal>
          <Header
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            guided={guided}
            onToggleGuided={() => setGuided((g) => !g)}
            onUpload={() => fileRef.current?.click()}
            onNav={onNav}
          />
        </Reveal>
        <MarketBar />
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />

        <main className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
          {notices.length > 0 && (
            <Card className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                {notices.map((n, i) => (
                  <div key={i} className="font-num text-[12px]" style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-3)' }}>
                    {n}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setNotices([])}
                className="font-num rounded-lg px-2 py-1 text-[11px]"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-3)' }}
              >
                dismiss
              </button>
            </Card>
          )}

          {/* trade-flow selector — account switcher */}
          <Reveal tour="personas">
            <FlowSelector
              tabs={personaTabs}
              activeId={activeId}
              onSelect={(id) => {
                setCustom(null);
                setActiveId(id);
              }}
              hasCustom={!!custom}
              customName={custom?.name ?? ''}
              customCount={custom?.trades.length ?? 0}
              onClearCustom={() => setCustom(null)}
              onUpload={() => fileRef.current?.click()}
              onTemplate={() => download('trademirror-uta-template.csv', CSV_TEMPLATE, 'text/csv')}
            />
          </Reveal>

          {/* research question lives on for screen readers + SEO; the scorecard verdict now carries it visually */}
          <h1 className="sr-only">Why did {personaName} bleed — and what exactly would discipline have been worth?</h1>

          {guided && (
            <div
              className="font-num rounded-xl px-4 py-2 text-center text-[11.5px]"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--accent)' }}
            >
              ◈ Guided view — score, curve, Ask Mirror, guardrails. Switch to <b>Full desk</b> in the header for heatmap, detectors &amp; log.
            </div>
          )}

          {/* forensic pipeline — clickable process spine + engine status */}
          <Reveal delay={60}>
            <Pipeline
              trades={trades.length}
              flags={comp.flags.length}
              leakUsd={m.totalLeakUsd}
              recovered={whatIf.recovered}
              brief={brief}
              armedCount={armed.length}
              armedTotal={ENGINE_RULE_IDS.length}
              rulesCount={audit?.defenseRules.length ?? 0}
              engineMs={engineMs}
              onJump={onJump}
              onTour={openTour}
            />
          </Reveal>

          {/* hero: scorecard + counterfactual */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Reveal className="lg:col-span-2" tour="score">
              <Scorecard
                metrics={m}
                personaName={personaName}
                sparks={sparks}
                groups={comp.groups}
                onTagSelect={(t) => {
                  setGuided(false);
                  setTagFilter(t);
                  window.setTimeout(() => {
                    document.querySelector('[data-tour="log"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 120);
                }}
              />
            </Reveal>
            <Reveal className="lg:col-span-3" tour="curve" delay={90}>
              <CounterfactualChart
                curve={whatIf.curve}
                netPnl={m.netPnl}
                cleanPnl={whatIf.cleanPnl}
                trades={trades}
                flagsByOrder={flagsByOrder}
                onMarkerClick={onCite}
              />
            </Reveal>
          </div>

          {/* LUI + heatmap */}
          <div className={guided ? 'grid gap-4' : 'grid items-stretch gap-4 lg:grid-cols-5'}>
            <Reveal className={guided ? '' : 'lg:col-span-3'} tour="ask">
              <AskMirror getPayload={getAskPayload} onCite={onCite} flowKey={flowKey} actions={askActions} />
            </Reveal>
            {!guided && (
              <Reveal className="lg:col-span-2" tour="heatmap" delay={90}>
                <LeakHeatmap trades={trades} leakByOrderId={comp.leakByOrderId} selected={logFilter} onCellClick={onCellClick} />
              </Reveal>
            )}
          </div>

          {/* taxonomy + defense + detectors */}
          <div className={guided ? 'grid items-stretch gap-4 md:grid-cols-2' : 'grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3'}>
            <Reveal>
              <BiasTaxonomy groups={comp.groups} totalLeak={m.totalLeakUsd} armed={armed} onToggle={toggleRule} audit={audit} />
            </Reveal>
            <Reveal tour="defense" delay={90}>
              <DefensePlan
                audit={audit}
                running={auditRunning}
                source={auditSource}
                latencyMs={auditLatency}
                degraded={auditDegraded}
                onRun={() => void runQwen()}
                armed={armed}
                onToggleRule={toggleRule}
                onArmAll={onArmAll}
                cleanDelta={whatIf.recovered}
              />
            </Reveal>
            {!guided && (
              <Reveal delay={180}>
                <DetectorRoster flags={comp.flags} armed={armed} onToggle={toggleRule} audit={audit} totalLeak={m.totalLeakUsd} />
              </Reveal>
            )}
          </div>

          {/* forensic log */}
          {!guided && (
            <Reveal tour="log">
              <ForensicLog
                trades={trades}
                flagsByOrder={flagsByOrder}
                leakByOrderId={comp.leakByOrderId}
                highlightOrderId={highlight}
                sessionFilter={logFilter}
                onClearFilter={() => setLogFilter(null)}
                tagFilter={tagFilter}
                onTagSelect={setTagFilter}
                audit={audit}
              />
            </Reveal>
          )}

          {/* export */}
          <Reveal tour="export">
            <ExportBar
              xText={xText}
              onExportJson={exportJson}
              onCopyRules={() => void copyRules()}
              onRenderCard={renderCardBlob}
              fileStem={fileStem}
              cardCaption={`${personaName} · ${comp.metrics.score}/100 ${comp.metrics.grade}`}
              rulesCount={audit?.defenseRules.length ?? 0}
            />
          </Reveal>

          <footer className="mt-2 border-t px-1 pb-6 pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
              <div>
                <div className="font-display text-[13px] font-bold tracking-tight" style={{ color: 'var(--ink-1)' }}>
                  TradeMirror
                </div>
                <div className="font-num mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  Bitget AI Base Camp Hackathon S2 · Track 3 · Review &amp; Self-Evolution
                </div>
              </div>
              <nav className="flex flex-wrap items-start gap-x-8 gap-y-3" aria-label="Project links">
                <div>
                  <div className="font-num text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                    Hackathon
                  </div>
                  <div className="font-num mt-1.5 flex items-center gap-4 text-[11px] font-semibold">
                    <a className="transition-colors hover:underline hover:underline-offset-2" style={{ color: 'var(--ink-2)' }} href="https://www.bitget.com/activity-hub/hackathon" target="_blank" rel="noreferrer">
                      Activity hub ↗
                    </a>
                    <a className="transition-colors hover:underline hover:underline-offset-2" style={{ color: 'var(--ink-2)' }} href="https://bitget-ai.gitbook.io/bitgetai_hackathons2" target="_blank" rel="noreferrer">
                      Developer guide ↗
                    </a>
                  </div>
                </div>
                <div>
                  <div className="font-num text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                    Build
                  </div>
                  <div className="font-num mt-1.5 flex items-center gap-4 text-[11px] font-semibold">
                    <a className="transition-colors hover:underline hover:underline-offset-2" style={{ color: 'var(--ink-2)' }} href="https://github.com/Bitget-AI/agent_hub" target="_blank" rel="noreferrer">
                      Agent hub ↗
                    </a>
                    <a className="transition-colors hover:underline hover:underline-offset-2" style={{ color: 'var(--ink-2)' }} href="https://github.com/hackid02/trademirror" target="_blank" rel="noreferrer">
                      Source code ↗
                    </a>
                  </div>
                </div>
              </nav>
            </div>
            <div className="font-num mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
              <span>Forensic + educational tool — not financial advice · paper/sim validation · no live orders</span>
              <span>Deterministic engine · Qwen synthesis when keyed</span>
            </div>
          </footer>
        </main>

        <TourFab fresh={!tourSeen} onOpen={openTour} onDismiss={dismissTourNudge} />
        <JudgeTour steps={TOUR_STEPS} open={tourOpen} onClose={() => setTourOpen(false)} onCite={onCite} />
      </div>
    </div>
  );
}
