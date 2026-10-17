const { chromium } = require('playwright-core');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const base = process.env.PACT_BASE_URL || 'http://127.0.0.1:3101';
// This release opens with business setup; set PACT_SETUP_FORK=0 only to check an
// app that starts directly on the original sample workspace.
const fork = process.env.PACT_SETUP_FORK !== '0';
const out = path.resolve(__dirname, '../output/reset-dialog'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/api/{analyze,memory,setup-draft}', route => { throw Error('This reset check makes no model requests.'); });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    if (fork) await page.getByRole('button', { name: 'Try the original sample workspace' }).click();
    await page.getByTestId('dashboard-view').waitFor();
    const before = (await (await context.request.get(base + '/api/workspace')).json()).workspace;
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 }); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.getByTestId('start-over').click(); const dialog = page.getByRole('dialog'); await dialog.waitFor();
      const rect = await page.locator('.modal-card').boundingBox();
      assert(rect.x >= 10 && rect.y >= 10 && rect.x + rect.width <= width - 10 && rect.y + rect.height <= 834);
      assert(Math.abs(rect.x + rect.width / 2 - width / 2) < 2);
      assert.equal(await page.locator('.modal-backdrop').evaluate(e => getComputedStyle(e).position), 'fixed');
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.screenshot({ path: path.join(out, `${width}.png`) });
      await dialog.getByRole('button', { name: 'Start over', exact: true }).focus(); await page.keyboard.press('Tab');
      assert(await dialog.getByRole('button', { name: 'Cancel' }).evaluate(e => e === document.activeElement));
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      assert(await page.getByTestId('start-over').evaluate(e => e === document.activeElement));
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
    }
    const route = fork ? '/api/new-workspace' : '/api/reset';
    await page.getByTestId('start-over').click();
    await context.route('**' + route, r => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated reset failure' }) }), { times: 1 });
    await page.getByRole('dialog').getByRole('button', { name: 'Start over', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.equal((await (await context.request.get(base + '/api/workspace')).json()).workspace.id, before.id);
    await page.getByRole('dialog').getByRole('button', { name: 'Start over', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    if (fork) { await page.getByTestId('business-setup').waitFor(); assert.equal((await (await context.request.get(base + '/api/workspace')).json()).workspace, null); }
    else { await page.getByTestId('dashboard-view').waitFor(); assert.notEqual((await (await context.request.get(base + '/api/workspace')).json()).workspace.id, before.id); }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: true, base, fork, providerCalls: 0, desktopMobile: true, centeredFixedDialog: true, keyboardFocus: true, failedResetPreservesWorkspace: true, actualReset: true, checkedAt: new Date().toISOString() }, null, 2));
    console.log('Reset dialog: desktop/mobile centering, keyboard, failure recovery and actual reset passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
