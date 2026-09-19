// ─── TradeMirror · QA sweep 2: untested user paths ────────────────────────────
// Tour full-walk, AskMirror Q&A + citations, heatmap→log drill-down, guardrail
// toggles, defense copy-JSON, theme persistence, reduced-motion load.
// Run against a local prod server: node qa-sweep2.js (exit 2 on any error)
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

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3500);
  note('home loaded');

  // 1. Tour: walk every step, then close
  const tourBtn = page.getByRole('button', { name: /guided tour/i }).first();
  if (await tourBtn.count()) {
    await tourBtn.click();
    await page.waitForTimeout(1000);
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(650);
    }
    await page.screenshot({ path: SHOTDIR + '/tour-mid.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    note('tour walked 16 steps + Escape-closed');
  } else {
    note('tour button NOT FOUND');
  }

  // 2. AskMirror: ask, answer, cite
  await page.locator('[data-tour="ask"]').scrollIntoViewIfNeeded();
  const box = page.locator('[data-tour="ask"]').getByRole('textbox');
  if (await box.count()) {
    await box.fill('What is my tilt pattern?');
    await page.waitForTimeout(300);
    await box.press('Enter');
    await page.waitForTimeout(4500);
    const cites = page
      .locator('[data-tour="ask"] button')
      .filter({ hasText: /TM-|#|order|cite|show|receipt/i });
    const n = await cites.count();
    note(`ask citations found: ${n}`);
    if (n > 0) {
      await cites.first().click();
      await page.waitForTimeout(1200);
      note('citation clicked (log jump + flash)');
    }
    await page.screenshot({ path: SHOTDIR + '/ask-cited.png' });
  } else {
    note('ask textbox NOT FOUND');
  }

  // 3. Heatmap → log drill-down
  await page.locator('[data-tour="heatmap"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const cell = page.locator('[data-tour="heatmap"] button').first();
  if (await cell.count()) {
    await cell.click();
    await page.waitForTimeout(1200);
    note('heatmap cell clicked');
  } else {
    await page
      .locator('[data-tour="heatmap"]')
      .click({ position: { x: 120, y: 60 } })
      .catch(() => {});
    note('heatmap: no buttons, container clicked');
  }

  // 4. Guardrail toggles (what-if recompute)
  await page.locator('[data-tour="defense"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const toggles = page.locator(
    '[data-tour="defense"] input[type="checkbox"], [data-tour="defense"] [role="switch"]',
  );
  const tn = await toggles.count();
  note(`defense toggles found: ${tn}`);
  if (tn > 0) {
    await toggles.first().click({ force: true });
    await page.waitForTimeout(1000);
    await toggles.first().click({ force: true });
    await page.waitForTimeout(800);
    note('guardrail toggled off + on (curve recompute)');
  }

  // 5. Defense copy-JSON
  const cp = page
    .locator('[data-tour="defense"] button')
    .filter({ hasText: /copy|json|⧉/i })
    .first();
  if (await cp.count()) {
    await cp.click();
    await page.waitForTimeout(400);
    note('defense copy-JSON clicked');
  } else {
    note('defense copy button NOT FOUND');
  }

  // 6. Theme toggle + persistence
  const themeBtn = page.getByRole('button', { name: /theme|dark mode|light mode/i }).first();
  if (await themeBtn.count()) {
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await themeBtn.click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const persisted = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    note(`theme ${before} → ${after}, persists across reload: ${persisted === after}`);
  } else {
    note('theme toggle NOT FOUND');
  }

  // 7. Reduced-motion load
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  rp.on('pageerror', (e) =>
    errors.push(`RMOTION PAGEERROR: ${String(e.message || e).split('\n')[0]}`),
  );
  rp.on('console', (m) => {
    if (m.type() === 'error') errors.push(`RMOTION CONSOLE: ${m.text().slice(0, 120)}`);
  });
  await rp.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 45000 });
  await rp.waitForTimeout(3000);
  note('reduced-motion load done');

  console.log(`ERRORS: ${errors.length}`);
  errors.slice(0, 15).forEach((e) => console.log(`  !! ${e}`));
  await browser.close();
  if (errors.length > 0) process.exit(2);
  console.log('QA SWEEP 2 DONE');
})().catch((e) => {
  console.error(`SWEEP FAIL: ${String(e.message || e).split('\n').slice(0, 14).join('\n')}`);
  console.log(`ERRORS AT FAILURE: ${errors.length}`);
  errors.slice(0, 15).forEach((err) => console.log(`  !! ${err}`));
  process.exit(1);
});
