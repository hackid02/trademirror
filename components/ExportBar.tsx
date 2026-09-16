'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function ExportBar({
  xText,
  onExportJson,
  onCopyRules,
  onRenderCard,
  rulesCount,
  fileStem,
  cardCaption,
}: {
  xText: string;
  onExportJson: () => void;
  onCopyRules: () => void;
  onRenderCard: () => Promise<Blob>;
  rulesCount: number;
  fileStem: string;
  cardCaption: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  // Brief length needs window.location (empty in SSR): SSR and the first client
  // render agree on the placeholder; the true count lands post-hydration.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-sync for SSR/client-identical first paint; the URL only exists in the browser
    setMounted(true);
  }, []);

  const flash = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 2200);
  };

  const close = () => {
    if (preview) URL.revokeObjectURL(preview);
    setOpen(false);
    setPreview(null);
    setBlob(null);
    setRenderError(null);
    setRendering(false);
  };

  const openPreview = () => {
    setOpen(true);
    setRendering(true);
    setRenderError(null);
    void onRenderCard()
      .then((b) => {
        setBlob(b);
        setPreview(URL.createObjectURL(b));
      })
      .catch(() => setRenderError('Card render failed in this browser — copy the brief instead.'))
      .finally(() => setRendering(false));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preview]);

  const downloadCard = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview;
    a.download = `${fileStem}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash('dl');
  };

  const copyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flash('img');
    } catch {
      setRenderError('Image copy blocked by this browser — download the PNG instead.');
    }
  };

  const copyBrief = async () => {
    flash((await copyText(xText)) ? 'x' : 'x-fail');
  };

  const copyRules = () => {
    onCopyRules();
    flash('rules');
  };

  const exportJson = () => {
    onExportJson();
    flash('json');
  };

  const briefCount = mounted ? `${xText.length}/280` : '···/280';
  const briefFits = !mounted || xText.length <= 280;

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <div className="text-[13px] font-bold">Social / export bar</div>
            <div className="font-num text-[11px]" style={{ color: 'var(--ink-3)' }}>
              one-click virality + machine-readable handoff
            </div>
          </div>
          <button
            onClick={openPreview}
            className="rounded-xl px-4 py-2.5 text-[12.5px] font-bold transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--accent)', color: '#04121a' }}
            title="Preview + download a 1200×630 PNG scorecard for X"
          >
            🖼 Share-card PNG
          </button>
          <button
            onClick={() => void copyBrief()}
            className="rounded-xl px-4 py-2.5 text-[12.5px] font-bold transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--ink)', color: 'var(--canvas)' }}
            title={
              briefFits
                ? 'Copy a single-post brief for X (fits 280 chars)'
                : 'Warning: brief exceeds the X single-post limit'
            }
          >
            {copied === 'x' ? (
              '✓ Brief copied — paste on X'
            ) : copied === 'x-fail' ? (
              '⚠ Copy blocked — retry'
            ) : (
              <>
                𝕏 Copy brief · <span className="font-num opacity-70">{briefCount}</span>
              </>
            )}
          </button>
          <button
            onClick={exportJson}
            className="rounded-xl px-4 py-2.5 text-[12.5px] font-semibold"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--ink)' }}
            title="Download the full audit (metrics, flags, trades, guardrails) as JSON"
          >
            {copied === 'json' ? '✓ JSON exported' : '↓ Export UTA v3 JSON'}
          </button>
          <button
            onClick={copyRules}
            disabled={rulesCount === 0}
            className="rounded-xl px-4 py-2.5 text-[12.5px] font-semibold disabled:opacity-40"
            style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
            title="Copy the guardrail pack for Agent Hub / Playbook deployment"
          >
            {copied === 'rules' ? '✓ Rules copied' : `◈ Deploy ${rulesCount} rules → Agent Hub / Playbook`}
          </button>
        </div>
      </Card>

      {/* Portalled: section wrappers carry transforms that trap position:fixed,
          collapsing the dialog + hiding the backdrop. document.body is immune. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Share card preview"
          >
            <button
              aria-label="Close preview"
              onClick={close}
              className="absolute inset-0 cursor-default"
              style={{ background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(6px)' }}
            />
            <Card className="relative max-h-[92vh] w-full max-w-[700px] overflow-y-auto p-4 sm:p-5">
              <div className="mb-3 flex items-start gap-3">
                <div className="mr-auto">
                  <div className="text-[13px] font-bold">Share-card preview</div>
                  <div className="font-num text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    {cardCaption} · 1200×630 PNG
                  </div>
                </div>
                <button
                  onClick={close}
                  autoFocus
                  aria-label="Close"
                  className="rounded-lg px-2.5 py-1.5 text-[13px] font-bold"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
                >
                  ✕
                </button>
              </div>
              {rendering ? (
                <div
                  className="flex aspect-[1200/630] w-full animate-pulse items-center justify-center rounded-xl font-num text-[12px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-3)' }}
                >
                  rendering card…
                </div>
              ) : preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob object-URL preview; next/image cannot optimize blobs
                <img
                  src={preview}
                  alt={`TradeMirror audit share card — ${cardCaption}`}
                  className="w-full rounded-xl"
                  style={{ border: '1px solid var(--border)' }}
                />
              ) : (
                <div
                  className="flex aspect-[1200/630] w-full items-center justify-center rounded-xl px-6 text-center font-num text-[12px]"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-3)' }}
                >
                  {renderError ?? 'Card unavailable.'}
                </div>
              )}
              {renderError && preview && (
                <p className="font-num mt-2 text-[11px]" style={{ color: 'var(--amber, #fbbf24)' }}>
                  {renderError}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={downloadCard}
                  disabled={!preview}
                  className="rounded-xl px-4 py-2.5 text-[12.5px] font-bold disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#04121a' }}
                >
                  {copied === 'dl' ? '✓ Downloading…' : '↓ Download PNG'}
                </button>
                <button
                  onClick={() => void copyImage()}
                  disabled={!blob}
                  className="rounded-xl px-4 py-2.5 text-[12.5px] font-semibold disabled:opacity-40"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--ink)' }}
                >
                  {copied === 'img' ? '✓ Image copied — paste on X' : '⧉ Copy image'}
                </button>
                <button
                  onClick={() => void copyBrief()}
                  className="rounded-xl px-4 py-2.5 text-[12.5px] font-semibold"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--ink)' }}
                >
                  {copied === 'x' ? (
                    '✓ Brief copied'
                  ) : (
                    <>
                      𝕏 Copy brief · <span className="font-num opacity-70">{briefCount}</span>
                    </>
                  )}
                </button>
              </div>
            </Card>
          </div>,
          document.body,
        )}
    </>
  );
}
