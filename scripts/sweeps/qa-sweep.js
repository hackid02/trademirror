// ─── TradeMirror · QA clickthrough sweep ─────────────────────────────────────
// Exercises every flow + drill-down + export modal + tour + upload while
// capturing pageerrors, console errors and failed requests. Exit 2 on any
// captured error. Run against a local prod server: node qa-sweep.js
const { chromium } = require('playwright');

const path = require('path');
const fs = require('fs');
const SHOTDIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTDIR, { recursive: true });

const errors = [];
const note = (s) => console.log(`  • ${s}`);

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${String(e.message || e).split('\n')[0]}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 160)}`);
  });
  page.on('requestfailed', (r) => errors.push(`REQFAIL: ${r.url().slice(0, 100)}`));

  const clickFlow = async (re) => {
    const btns = page.locator('button');
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      const t = await btns.nth(i).innerText().catch(() => '');
      if (re.test(t)) {
        await btns.nth(i).click();
        return t.slice(0, 40).replace(/\n/g, ' ');
      }
    }
    return null;
  };

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3500);
  note('home loaded');

  for (const re of [/Revenge/i, /Disciplined/i, /Weekend/i]) {
    const hit = await clickFlow(re);
    await page.waitForTimeout(2800);
    note(`flow ${re} → ${hit ? `clicked: ${hit}` : 'NOT FOUND'}`);
  }

  // Disciplined-flow proofs: clean donut state + $0 process-foul badge
  await clickFlow(/Disciplined/i);
  await page.waitForTimeout(2500);
  note(`clean-donut empty state visible: ${(await page.getByText('No behavioral leaks detected').count()) > 0}`);
  await page.locator('[data-tour="log"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  note(`$0 process-foul badge visible: ${(await page.getByText('process foul').count()) > 0}`);
  await page.screenshot({ path: SHOTDIR + '/disciplined-log.png' });

  // Donut → log drill-down on the cold flow
  await clickFlow(/Weekend/i);
  await page.waitForTimeout(2500);
  const legendClicked = await page.evaluate(() => {
    const el = document.querySelector('[title*="filter the forensic log"]');
    if (el) {
      el.click();
      return true;
    }
    return false;
  });
  await page.waitForTimeout(1200);
  note(`donut legend click → log: ${legendClicked}`);
  await page.screenshot({ path: SHOTDIR + '/donut-to-log.png' });

  // Export modal: preview render + copy + Escape
  await page.getByRole('button', { name: /Share-card PNG/ }).click();
  await page.waitForTimeout(1500);
  const imgOk = await page.evaluate(() => {
    const img = document.querySelector('[role="dialog"] img');
    return img ? img.naturalWidth > 0 : false;
  });
  note(`share-card preview rendered (naturalWidth>0): ${imgOk}`);
  await page.screenshot({ path: SHOTDIR + '/export-modal.png' });
  await page.locator('[role="dialog"]').getByRole('button', { name: /Copy brief/ }).click();
  await page.waitForTimeout(400);
  const clip = await page.evaluate(() =>
    navigator.clipboard.readText().then((t) => t.length).catch(() => -1),
  );
  note(`clipboard brief length after copy: ${clip}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  note(`modal closes on Escape: ${(await page.locator('[role="dialog"]').count()) === 0}`);

  // In-bar quick actions
  await page.getByText('Social / export bar').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /Copy brief/ }).first().click();
  await page.waitForTimeout(300);
  note(`in-bar brief feedback: ${(await page.getByText('Brief copied').count()) > 0}`);
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.getByRole('button', { name: /Export UTA v3 JSON/ }).click();
  note(`UTA JSON download fired: ${(await dl) !== null}`);
  await page.getByRole('button', { name: /Deploy \d+ rules/ }).click();
  await page.waitForTimeout(300);
  note(`deploy feedback: ${(await page.getByText('Rules copied').count()) > 0}`);

  // Tour open/close
  const tourBtn = page.getByRole('button', { name: /guided tour/i }).first();
  if (await tourBtn.count()) {
    await tourBtn.click();
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    note('tour opened + Escape-closed');
  } else {
    note('tour button NOT FOUND');
  }

  // Upload: 2 valid rows + 1 broken row
  const fs = require('fs');
  fs.writeFileSync(
    '/tmp/upload-qa.csv',
    'symbol,side,orderType,timestamp,realizedPnl,fee,notionalUsd\nBTCUSDT,BUY,market,2026-09-01T03:13:00Z,101.29,4.45,8902.56\nrAAPLUSDT,SELL,market,2026-08-30T12:03:00Z,-114.46,2.10,5200.00\nBROKEN,BUY,market,not-a-date,0,0,0\n',
  );
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.count()) {
    await fileInput.setInputFiles('/tmp/upload-qa.csv');
    await page.waitForTimeout(2500);
    note(`upload ingested 2/3 rows (1 skipped): ${(await page.getByText(/Ingested 2 trades/).count()) > 0}`);
  } else {
    note('file input NOT FOUND');
  }

  // Mobile viewport: export bar
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push(`MOBILE PAGEERROR: ${String(e.message || e).split('\n')[0]}`));
  await mp.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 45000 });
  await mp.waitForTimeout(3000);
  await mp.getByText('Social / export bar').scrollIntoViewIfNeeded();
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: SHOTDIR + '/mobile-export.png' });
  note('mobile 390px export shot taken');

  console.log(`ERRORS: ${errors.length}`);
  errors.slice(0, 15).forEach((e) => console.log(`  !! ${e}`));
  await browser.close();
  if (errors.length > 0) process.exit(2);
  console.log('QA SWEEP DONE');
})().catch((e) => {
  console.error(`SWEEP FAIL: ${String(e.message || e).split('\n').slice(0, 14).join('\n')}`);
  console.log(`ERRORS AT FAILURE: ${errors.length}`);
  errors.slice(0, 15).forEach((err) => console.log(`  !! ${err}`));
  process.exit(1);
});
