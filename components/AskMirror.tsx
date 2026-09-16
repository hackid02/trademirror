'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AskFlag } from '@/app/api/ask/route';
import { Card, SectionTitle, SoftBadge } from './ui';

export interface AskPayload {
  personaName: string;
  metrics: Record<string, number | string>;
  groups: Array<{ tag: string; biasName: string; dollarCost: number; tradeCount: number }>;
  flags: AskFlag[];
  score: number;
  grade: string;
  archetype: string;
}

export interface AskAction {
  label: string;
  hint?: string;
  onRun: () => void;
}

interface Msg {
  role: 'user' | 'mirror';
  text: string;
  citations?: string[];
  source?: 'qwen' | 'mock';
  ms?: number;
}

/** Inline parse: **bold** + [ORDER-ID] citations. */
function Inline({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const segs = text.split(/(\*\*[^*]+\*\*|\[[A-Z0-9-]+\])/g);
  return (
    <>
      {segs.map((p, i) => {
        const cite = p.match(/^\[([A-Z0-9-]+)\]$/);
        if (cite) {
          return (
            <button
              key={i}
              onClick={() => onCite(cite[1])}
              className="font-num mx-0.5 rounded px-1 py-px text-[11.5px] font-bold underline decoration-dotted underline-offset-2"
              style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
              title={`Jump to ${cite[1]} in the forensic log`}
            >
              {p}
            </button>
          );
        }
        const bold = p.match(/^\*\*([^*]+)\*\*$/);
        if (bold) {
          return (
            <strong key={i} style={{ color: 'var(--ink)' }}>
              {bold[1]}
            </strong>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/** Block parse: "- " bullets + blank-line paragraphs, so model answers keep their structure. */
function RichText({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (t === '') return <div key={i} className="h-1.5" />;
        if (t.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2">
              <span style={{ color: 'var(--accent)' }}>▸</span>
              <span className="min-w-0 flex-1">
                <Inline text={t.slice(2)} onCite={onCite} />
              </span>
            </div>
          );
        }
        return (
          <div key={i}>
            <Inline text={ln} onCite={onCite} />
          </div>
        );
      })}
    </>
  );
}

export default function AskMirror({
  getPayload,
  onCite,
  flowKey,
  actions,
}: {
  getPayload: () => AskPayload;
  onCite: (orderId: string) => void;
  flowKey: string;
  actions?: AskAction[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Deterministic auto-brief (TradeGPT pattern): instant flow summary, zero API cost.
  const brief = useMemo(() => {
    const p = getPayload();
    const total = p.groups.reduce((s, g) => s + g.dollarCost, 0);
    const top = [...p.groups].sort((a, b) => b.dollarCost - a.dollarCost)[0] ?? null;
    return {
      score: p.score,
      grade: p.grade,
      archetype: p.archetype,
      top,
      topPct: top && total > 0 ? (top.dollarCost / total) * 100 : 0,
      flagCount: p.flags.length,
      groupCount: p.groups.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey]);

  const chips = useMemo(
    () => [
      'Why did I bleed the most?',
      brief.top ? `Show my ${brief.top.tag} trades` : 'Show my weekend spread trades',
      'What is my tilt pattern?',
      'Am I cutting winners early?',
      'What would discipline have saved?',
    ],
    [brief.top],
  );

  // Reset thread when the flow changes (render-time adjust: no post-paint cascade)
  const [lastFlow, setLastFlow] = useState(flowKey);
  if (flowKey !== lastFlow) {
    setLastFlow(flowKey);
    setMsgs([]);
    setInput('');
  }

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...getPayload(), question }),
      });
      const data = (await res.json()) as {
        answer?: string;
        citations?: string[];
        source?: 'qwen' | 'mock';
        latencyMs?: number;
      };
      setMsgs((m) => [
        ...m,
        {
          role: 'mirror',
          text: data.answer ?? 'No answer returned — try rephrasing.',
          citations: data.citations ?? [],
          source: data.source ?? 'mock',
          ms: data.latencyMs ?? 0,
        },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: 'mirror', text: 'Request failed — check connection and retry.', citations: [] }]);
    } finally {
      setBusy(false);
    }
  };

  const copyMsg = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      window.setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <Card className="flex h-full flex-col p-5" hover>
      <SectionTitle
        eyebrow="LUI · ask your own audit"
        title="Ask Mirror"
        right={<SoftBadge tone="dim">evidence-only · cites order IDs</SoftBadge>}
      />

      <div ref={boxRef} className="flex max-h-[340px] min-h-[220px] flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {msgs.length === 0 && !busy && (
          <div className="rounded-xl px-4 py-4" style={{ background: 'var(--surface-2)', border: '1px dashed var(--border-strong)' }}>
            <div className="font-num text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
              ◈ Auto-brief · this flow
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <div className="min-w-0 rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                <div className="font-num text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
                  Score
                </div>
                <div className="font-num truncate text-[14px] font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {brief.score} · {brief.grade}
                </div>
                <div className="truncate text-[10px]" style={{ color: 'var(--ink-3)' }}>
                  {brief.archetype}
                </div>
              </div>
              <div className="min-w-0 rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                <div className="font-num text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
                  Top bias
                </div>
                <div className="font-num truncate text-[12px] font-bold" style={{ color: 'var(--risk)' }} title={brief.top?.tag ?? '—'}>
                  {brief.top?.tag ?? '—'}
                </div>
                <div className="font-num text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                  {brief.top ? `${brief.topPct.toFixed(0)}% of leak` : 'clean flow'}
                </div>
              </div>
              <div className="min-w-0 rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                <div className="font-num text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
                  Receipts
                </div>
                <div className="font-num truncate text-[14px] font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {brief.flagCount}
                </div>
                <div className="font-num text-[10px]" style={{ color: 'var(--ink-3)' }}>
                  {brief.groupCount} bias groups
                </div>
              </div>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              Every answer is computed from these logged trades — never hallucinated. Tap a chip or ask anything; click any{' '}
              <span className="font-num font-bold" style={{ color: 'var(--accent)' }}>
                [ORDER-ID]
              </span>{' '}
              to jump to the receipt.
            </p>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] font-medium" style={{ background: 'var(--accent)', color: '#04121a' }}>
              {m.text}
            </div>
          ) : (
            <div key={i} className="max-w-[95%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-relaxed" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <RichText text={m.text} onCite={onCite} />
              <div className="font-num mt-1.5 flex items-center gap-2 text-[10px]" style={{ color: 'var(--ink-3)' }}>
                <span style={{ color: m.source === 'qwen' ? 'var(--alpha)' : 'var(--warn)' }}>
                  {m.source === 'qwen' ? '◈ qwen3.8-max' : '※ deterministic'} · {m.ms}ms
                </span>
                {m.citations && m.citations.length > 0 && <span>· {m.citations.length} citation{m.citations.length === 1 ? '' : 's'}</span>}
                <button
                  onClick={() => void copyMsg(i, m.text)}
                  className="ml-auto underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
                  title="Copy answer to clipboard"
                >
                  {copied === i ? '✓ copied' : '⧉ copy'}
                </button>
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="thinking-shimmer max-w-[70%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[12px]" style={{ border: '1px solid var(--border)' }}>
            ◈ Mirror is pulling receipts…
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => void send(c)}
            disabled={busy}
            className="font-num rounded-full px-2.5 py-1 text-[11px] font-semibold transition-transform hover:scale-[1.03] disabled:opacity-40"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--ink-2)' }}
          >
            {c}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          aria-label="Ask about your audit"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. why did weekends hurt me?"
          className="font-num min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-bold transition-transform hover:scale-[1.02] disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#04121a' }}
        >
          Ask →
        </button>
      </form>

      {actions && actions.length > 0 && (
        <div className="mt-3 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
          <div className="font-num mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
            ◈ Suggested actions — Mirror drives the desk
          </div>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={a.onRun}
                title={a.hint}
                className="font-num rounded-full px-2.5 py-1 text-[11px] font-semibold transition-transform hover:scale-[1.03]"
                style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
