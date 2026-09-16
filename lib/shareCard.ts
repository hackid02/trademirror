// ─── TradeMirror · X Share-Card Renderer ─────────────────────────────────────
// 1200×630 canvas card: score ring, archetype, leak $, clean-vs-actual.
// No external assets — pure Canvas 2D so it works offline and in judges' browsers.

export interface ShareCardInput {
  persona: string;
  score: number;
  grade: string;
  archetype: string;
  leakUsd: number;
  netPnl: number;
  cleanPnl: number;
  totalTrades: number;
  winRate: number;
  url: string;
}

const money0 = (n: number, signed = false): string => {
  const sign = signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

export function renderShareCard(o: ShareCardInput): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const W = 1200;
    const H = 630;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    if (!g) {
      reject(new Error('canvas unavailable'));
      return;
    }

    // backdrop
    g.fillStyle = '#080a0f';
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, -80, 60, W / 2, -80, 700);
    glow.addColorStop(0, '#14202f');
    glow.addColorStop(1, 'rgba(8,10,15,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let x = 0; x <= W; x += 44) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }

    // header
    g.fillStyle = '#00f2fe';
    g.font = '700 30px Inter, system-ui, sans-serif';
    g.fillText('🪞 TradeMirror', 64, 84);
    g.fillStyle = 'rgba(232,237,244,0.55)';
    g.font = '600 22px Inter, system-ui, sans-serif';
    g.fillText('BITGET AI HACKATHON S2 · TRACK 3 · REVIEW & SELF-EVOLUTION', 64, 120);

    // persona
    g.fillStyle = '#e8edf4';
    g.font = '700 54px Inter, system-ui, sans-serif';
    g.fillText(o.persona, 64, 200);
    g.fillStyle = 'rgba(232,237,244,0.6)';
    g.font = '500 26px Inter, system-ui, sans-serif';
    g.fillText(`${o.totalTrades} trades · ${(o.winRate * 100).toFixed(0)}% win rate · behavioural audit`, 64, 242);

    // score ring
    const cx = 985;
    const cy = 250;
    const R = 110;
    g.lineWidth = 22;
    g.lineCap = 'round';
    g.strokeStyle = '#182030';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    const frac = Math.max(0, Math.min(100, o.score)) / 100;
    g.strokeStyle = o.score >= 88 ? '#00e676' : o.score >= 70 ? '#00f2fe' : o.score >= 55 ? '#fbbf24' : '#ff4d6d';
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e8edf4';
    g.font = '700 84px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(o.score), cx, cy + 18);
    g.font = '700 24px Inter, system-ui, sans-serif';
    g.fillStyle = 'rgba(232,237,244,0.6)';
    g.fillText(`/ 100 · ${o.grade}`, cx, cy + 56);
    g.textAlign = 'left';

    // archetype pill
    g.font = '700 26px Inter, system-ui, sans-serif';
    const pillW = g.measureText(o.archetype.toUpperCase()).width + 56;
    g.fillStyle = 'rgba(0,242,254,0.12)';
    g.strokeStyle = 'rgba(0,242,254,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    (g as CanvasRenderingContext2D).roundRect(64, 282, pillW, 56, 28);
    g.fill();
    g.stroke();
    g.fillStyle = '#00f2fe';
    g.fillText(o.archetype.toUpperCase(), 92, 320);

    // stat trio
    const stats: Array<[string, string, string]> = [
      ['BEHAVIOURAL LEAK', money0(-o.leakUsd), '#ff4d6d'],
      ['ACTUAL REALIZED', money0(o.netPnl, true), '#e8edf4'],
      ['CLEAN FILTERED', money0(o.cleanPnl, true), '#00e676'],
    ];
    stats.forEach(([label, value, color], i) => {
      const x = 64 + i * 360;
      const y = 400;
      g.fillStyle = 'rgba(232,237,244,0.5)';
      g.font = '600 20px Inter, system-ui, sans-serif';
      g.fillText(label, x, y);
      g.fillStyle = color;
      g.font = '700 62px ui-monospace, SFMono-Regular, Menlo, monospace';
      g.fillText(value, x, y + 72);
    });

    // footer
    g.fillStyle = '#00f2fe';
    g.font = '700 26px Inter, system-ui, sans-serif';
    g.fillText('#BitgetHackathon   @Bitget_AI', 64, 566);
    g.fillStyle = 'rgba(232,237,244,0.45)';
    g.font = '500 22px ui-monospace, Menlo, monospace';
    const shortUrl = o.url.replace(/^https?:\/\//, '').split('?')[0].slice(0, 48);
    g.fillText(shortUrl, 64, 598);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(232,237,244,0.45)';
    g.font = '500 20px Inter, system-ui, sans-serif';
    g.fillText('why money bled — in dollars', W - 64, 566);
    g.textAlign = 'left';

    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
