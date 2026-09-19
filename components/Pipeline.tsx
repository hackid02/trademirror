'use client';

import { useEffect, useState } from 'react';
import { Card } from './ui';
import { fmtUsd } from '@/lib/engine';

export type BriefState = { mode: 'running' } | { mode: 'qwen' | 'mock'; ms: number };

function useTapeStatus(): 'live' | 'sim' | 'off' {
  const [tape, setTape] = useState<'live' | 'sim' | 'off'>('off');
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch('/api/tickers', { cache: 'no-store' });
        if (!r.ok) throw new Error('tape');
        const j = (await r.json()) as { live?: boolean };
        if (!stop) setTape(j.live ? 'live' : 'sim');
      } catch {
        if (!stop) setTape('off');
      }
    };
    void load();
    const id = window.setInterval(load, 60000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  return tape;
}

function Dot({ color, pulse = true }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

function StatusDots({ brief, engineMs }: { brief: BriefState; engineMs: number }) {
  const tape = useTapeStatus();
  const qwen =
    brief.mode === 'running'
      ? { c: 'var(--warn)', t: 'SYNC' }
      : brief.mode === 'qwen'
        ? { c: 'var(--alpha)', t: 'LIVE' }
        : { c: 'var(--warn)', t: 'FALLBACK' };
  const tapeState =
    tape === 'live'
      ? { c: 'var(--alpha)', t: 'LIVE' }
      : tape === 'sim'
        ? { c: 'var(--warn)', t: 'SIM' }
        : { c: 'var(--risk)', t: 'OFF' };
  return (
    <div className="font-num flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold tracking-wide">
      <span className="flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }} title={`Deterministic engine · ${engineMs.toFixed(1)}ms`}>
        <Dot color="var(--alpha)" pulse={false} /> ENGINE · {engineMs.toFixed(1)}MS
      </span>
      <span className="flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }} title={brief.mode === 'running' ? 'Qwen synthesis in flight' : `Brief: ${brief.mode} · ${brief.ms}ms`}>
        <Dot color={qwen.c} pulse={brief.mode === 'running'} /> QWEN · {qwen.t}
      </span>
      <span className="flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }} title="Bitget spot tape (60s refresh, SIM fallback)">
        <Dot color={tapeState.c} pulse={tape === 'live'} /> TAPE · {tapeState.t}
      </span>
    </div>
  );
}

export default function Pipeline({
  trades,
  flags,
  leakUsd,
  recovered,
  brief,
  armedCount,
  armedTotal,
  rulesCount,
  engineMs,
  onJump,
  onTour,
}: {
  trades: number;
  flags: number;
  leakUsd: number;
  recovered: number;
  brief: BriefState;
  armedCount: number;
  armedTotal: number;
  rulesCount: number;
  engineMs: number;
  onJump: (tour: string) => void;
  onTour: () => void;
}) {
  const stages = [
    { n: '00', label: 'Recover', value: fmtUsd(recovered, true), sub: 'armed value', tour: 'curve', hint: 'Jump to the what-if curve' },
    { n: '01', label: 'Ingest', value: `${trades}`, sub: 'trades scanned', tour: 'personas', hint: 'Jump to flow picker' },
    { n: '02', label: 'Detect', value: `${flags}`, sub: 'leak flags', tour: 'log', hint: 'Jump to forensic log' },
    { n: '03', label: 'Attribute', value: fmtUsd(-leakUsd), sub: 'attributed leak', tour: 'curve', hint: 'Jump to counterfactual' },
    {
      n: '04',
      label: 'Brief',
      value: brief.mode === 'running' ? '…' : `${brief.ms}ms`,
      sub: brief.mode === 'running' ? 'synthesizing' : brief.mode === 'qwen' ? 'qwen3.8-max' : 'fallback',
      tour: 'defense',
      hint: 'Jump to defense brief',
    },
    { n: '05', label: 'Guardrail', value: `${armedCount}/${armedTotal}`, sub: 'armed', tour: 'defense', hint: 'Jump to guardrails' },
    { n: '06', label: 'Export', value: `${rulesCount}`, sub: 'deployable rules', tour: 'export', hint: 'Jump to export' },
  ];
  return (
    <Card className="px-4 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-stretch gap-1 overflow-x-auto pb-0.5">
          {stages.map((s, i) => (
            <div key={s.n} className="flex min-w-0 flex-1 items-stretch" style={{ minWidth: 116 }}>
              <button
                onClick={() => onJump(s.tour)}
                title={s.hint}
                className="group min-w-0 flex-1 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
              >
                <div className="font-num whitespace-nowrap text-[9px] font-bold tracking-[0.16em]" style={{ color: 'var(--ink-3)' }}>
                  {s.n} · {s.label.toUpperCase()}
                </div>
                <div className="font-num whitespace-nowrap text-[15px] font-bold leading-tight">{s.value}</div>
                <div className="font-num whitespace-nowrap text-[10px]" style={{ color: 'var(--ink-3)' }}>
                  {s.sub}
                </div>
              </button>
              {i < stages.length - 1 && (
                <div className="font-num flex items-center px-0.5 text-[13px]" style={{ color: 'var(--border-strong)' }} aria-hidden>
                  ›
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onTour}
            className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
          >
            ▶ 60-sec guided tour
          </button>
          <StatusDots brief={brief} engineMs={engineMs} />
        </div>
      </div>
    </Card>
  );
}
