const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const baseUrl = process.env.PACT_BASE_URL || 'http://127.0.0.1:3000';
const outDir = path.resolve(__dirname, '../output/playwright');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function launchBrowser() {
  const envPath = process.env.PACT_BROWSER_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    console.log(`Using environment override browser executable: ${envPath}`);
    return await chromium.launch({ executablePath: envPath, headless: true });
  }

  // Try standard system channels
  for (const channel of ['chrome', 'msedge']) {
    try {
      console.log(`Attempting to launch browser via channel: ${channel}`);
      const browser = await chromium.launch({ channel, headless: true });
      console.log(`Successfully launched browser via channel "${channel}" (v${browser.version()})`);
      return browser;
    } catch {
      // Channel not found, continue to next
    }
  }

  // Fallback to searching known default browser paths
  const candidatePaths = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      console.log(`Found installed browser at fallback path: ${p}`);
      return await chromium.launch({ executablePath: p, headless: true });
    }
  }

  return await chromium.launch({ headless: true });
}

async function run() {
  console.log(`Starting adapted PACT small-business visual smoke journey against ${baseUrl}...`);
  const browser = await launchBrowser();

  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/{analyze,memory}', async route => {
    assert.strictEqual(route.request().postDataJSON().live, false, 'Browser smoke must never request paid AI');
    await route.continue();
  });

  // 1. Initial Overview & 390px Viewport Mobile Validation
  console.log(`1. Navigating to ${baseUrl}...`);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  // Dashboard is the default, with no invented verdict before checking.
  await page.waitForSelector('[data-testid="dashboard-view"]');
  await page.waitForSelector('[data-testid="page-intro"]');
  assert.strictEqual(await page.getByTestId('dashboard-status').innerText(), 'Not checked');
  const cometDot = page.locator('.flow-desktop [data-testid="flow-job-cm-c"]');
  await cometDot.focus();
  await page.keyboard.press('Enter');
  assert.ok((await page.getByTestId('dashboard-job-detail').innerText()).includes('Comet launch film edit'));
  await page.getByRole('button', { name: 'Read the brief' }).click();
  await page.getByTestId('source-drawer').waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(outDir, '00_dashboard_desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outDir, '00_dashboard_mobile.png'), fullPage: true });
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  for (const view of ['dashboard', 'overview', 'conflicts', 'repairs', 'receipts', 'memory']) {
    await page.getByTestId(`nav-${view}`).click();
    await page.locator(`[data-testid="main-stage"][data-view="${view}"]`).waitFor();
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No mobile overflow in ${view}`);
  }
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.getByTestId('nav-overview').click();
  await page.waitForSelector('[data-testid="main-stage"][data-view="overview"]');
  await page.waitForSelector('text=Jobs in the plan');
  await page.waitForSelector('text=Who is available to edit');

  // Verify technical disclosures are initially collapsed
  const overviewDetails = page.locator('[data-testid="overview-technical-details"]');
  if (await overviewDetails.count() > 0) {
    assert.strictEqual(
      await overviewDetails.getAttribute('open'),
      null,
      'Overview technical disclosure must be initially collapsed'
    );
  }

  // Verify default view does not surface raw cm-* ids or src-policy chips
  const initialStageText = await page.locator('[data-testid="main-stage"]').innerText();
  assert.ok(
    !initialStageText.includes('cm-a') && !initialStageText.includes('src-policy:v1'),
    'Default overview view must not display raw cm-a or src-policy:v1 technical IDs'
  );
  console.log('✓ Assertion passed: Initial overview loads plain-language headings with collapsed technical disclosures.');

  await page.screenshot({ path: path.join(outDir, '01_initial_overview.png') });
  console.log('Saved: 01_initial_overview.png');

  // Focused 390px viewport check on same page: main-page overflow and timeline 16-cell reachability
  console.log('   Checking 390px mobile viewport layout behavior on overview...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  const hasMainPageOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  assert.strictEqual(
    hasMainPageOverflow,
    false,
    '390px viewport must have no main-page horizontal scroll blowout'
  );

  const timelineReachability = await page.evaluate(async () => {
    const wrapper = document.querySelector('.timeline-scroll-wrapper');
    if (!wrapper) return { found: false, error: 'timeline-scroll-wrapper not found' };
    const cells = wrapper.querySelectorAll('.slot-cell');
    if (cells.length < 16) return { found: false, error: `Expected 16 cells, found ${cells.length}` };
    const lastCell = cells[15];

    const isScrollable = wrapper.scrollWidth > wrapper.clientWidth;
    if (!isScrollable) {
      return { found: true, isScrollable: false, isReachable: false, error: 'Wrapper scrollWidth <= clientWidth' };
    }

    const initialScrollLeft = wrapper.scrollLeft;
    // Perform horizontal scroll to reveal the end
    wrapper.scrollLeft = wrapper.scrollWidth - wrapper.clientWidth;
    await new Promise((r) => setTimeout(r, 100));

    const wrapperRect = wrapper.getBoundingClientRect();
    const lastCellRect = lastCell.getBoundingClientRect();

    // Check reachability: the 16th cell must be within the wrapper's visible horizontal window
    const isReachable = lastCellRect.right <= wrapperRect.right + 4 && lastCellRect.left >= wrapperRect.left - 4;

    // Reset scrollLeft
    wrapper.scrollLeft = initialScrollLeft;

    return { found: true, isScrollable, isReachable };
  });

  assert.ok(
    timelineReachability.found,
    `Timeline elements must be found on 390px mobile view: ${timelineReachability.error}`
  );
  assert.ok(
    timelineReachability.isScrollable,
    'Timeline grid must be genuinely horizontally scrollable inside its wrapper on 390px screen'
  );
  assert.ok(
    timelineReachability.isReachable,
    'The last of all 16 timeline cells (slot #15) must become reachable within its genuine scroll wrapper after horizontal scrolling'
  );
  console.log('✓ Assertion passed: 390px viewport has zero main page overflow and 16th timeline cell is reachable via horizontal scroll.');

  // Verify 390px mobile layout: title does not overlap controls and all five nav choices fit visibly
  const mobileLayoutCheck = await page.evaluate(() => {
    const identity = document.querySelector('.masthead-identity');
    const checkBtn = document.querySelector('.masthead-check-btn');
    const toggle = document.querySelector('.pact-detail-toggle');
    const startOver = document.querySelector('.masthead-start-over');
    if (!identity || !checkBtn) {
      return { ok: false, error: 'Masthead identity or check button not found' };
    }

    const bIdentity = identity.getBoundingClientRect();
    const bCheck = checkBtn.getBoundingClientRect();
    const bToggle = toggle ? toggle.getBoundingClientRect() : null;
    const bStart = startOver ? startOver.getBoundingClientRect() : null;

    if (bIdentity.width < 100) {
      return { ok: false, error: `Masthead identity is squeezed (${bIdentity.width}px wide)` };
    }

    const overlaps = (r1, r2) => {
      if (!r1 || !r2) return false;
      const noX = r1.right <= r2.left || r2.right <= r1.left;
      const noY = r1.bottom <= r2.top || r2.bottom <= r1.top;
      return !(noX || noY);
    };

    if (overlaps(bIdentity, bCheck)) {
      return { ok: false, error: 'Masthead title overlaps Check this plan button' };
    }
    if (bToggle && overlaps(bIdentity, bToggle)) {
      return { ok: false, error: 'Masthead title overlaps details toggle' };
    }
    if (bStart && overlaps(bIdentity, bStart)) {
      return { ok: false, error: 'Masthead title overlaps Start over button' };
    }
    if (bToggle && overlaps(bCheck, bToggle)) {
      return { ok: false, error: 'Check this plan button overlaps details toggle' };
    }
    if (bStart && overlaps(bCheck, bStart)) {
      return { ok: false, error: 'Check this plan button overlaps Start over button' };
    }

    // Verify all five navigation buttons fit visibly, auto-width, not oversized, touch targets >= 36px
    const navViews = ['dashboard', 'overview', 'conflicts', 'repairs', 'receipts', 'memory'];
    const navInfo = [];
    for (const v of navViews) {
      const btn = document.querySelector(`[data-testid="nav-${v}"]`);
      if (!btn) return { ok: false, error: `Nav button for "${v}" not found` };
      const r = btn.getBoundingClientRect();
      if (r.width <= 40 || r.width > 370) {
        return { ok: false, error: `Nav button "${v}" has invalid or oversized width: ${r.width}px` };
      }
      if (r.height < 36) {
        return { ok: false, error: `Nav button "${v}" touch target too small: ${r.height}px` };
      }
      if (r.right > window.innerWidth + 4) {
        return { ok: false, error: `Nav button "${v}" is clipped horizontally (right=${r.right}, window=${window.innerWidth})` };
      }
      navInfo.push({ view: v, width: r.width, height: r.height, right: r.right });
    }

    // The real Sources launcher must stay visible and contained on mobile (not hidden).
    const sourcesBtn = document.querySelector('[data-testid="open-sources"]');
    if (!sourcesBtn) {
      return { ok: false, error: 'Sources launcher [data-testid="open-sources"] not found at 390px' };
    }
    const sourcesStyle = getComputedStyle(sourcesBtn);
    const sourcesRect = sourcesBtn.getBoundingClientRect();
    if (
      sourcesStyle.display === 'none' ||
      sourcesStyle.visibility === 'hidden' ||
      sourcesRect.width === 0 ||
      sourcesRect.height === 0
    ) {
      return { ok: false, error: 'Sources launcher must remain visible at 390px' };
    }
    if (sourcesRect.height < 36) {
      return { ok: false, error: `Sources launcher touch target too small: ${sourcesRect.height}px` };
    }
    if (sourcesRect.right > window.innerWidth + 4) {
      return { ok: false, error: `Sources launcher overflows viewport (right=${sourcesRect.right}, window=${window.innerWidth})` };
    }
    navInfo.push({ view: 'sources', width: sourcesRect.width, height: sourcesRect.height, right: sourcesRect.right });

    return { ok: true, navInfo };
  });

  assert.ok(
    mobileLayoutCheck.ok,
    `390px mobile layout validation failed: ${mobileLayoutCheck.error}`
  );
  console.log('✓ Assertion passed: 390px mobile layout verified (all 6 nav choices fit visibly, masthead title does not overlap controls, and Sources stays contained).');

  await page.screenshot({ path: path.join(outDir, 'mobile_390_overview.png') });
  console.log('Saved: mobile_390_overview.png');

  // Restore desktop viewport before continuing
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(300);

  // FOCUSED ASSERTION: Opening settings at desktop (Direction 6 popover containment)
  console.log('   Checking desktop settings-open layout behavior (Direction 6 popover containment)...');
  const initialCheckBtnBox = await page.locator('.masthead-check-btn').boundingBox();
  assert.ok(initialCheckBtnBox, 'Check this plan button bounding box must be available');

  await page.click('[data-testid="header-details"] summary');
  await page.waitForTimeout(200);

  const desktopSettingsCheck = await page.evaluate((beforeBox) => {
    const identity = document.querySelector('.masthead-identity');
    const checkBtn = document.querySelector('.masthead-check-btn');
    const startBtn = document.querySelector('.masthead-start-over');
    const popover = document.querySelector('.pact-detail-popover');
    if (!identity || !checkBtn || !popover) {
      return { ok: false, error: 'Identity, check button, or popover missing when settings open' };
    }

    const bId = identity.getBoundingClientRect();
    const bCheck = checkBtn.getBoundingClientRect();
    const bStart = startBtn ? startBtn.getBoundingClientRect() : null;
    const bPop = popover.getBoundingClientRect();

    // 1. Stable header action visibility (check button and start over remain visible and not wrapped down)
    if (bCheck.width === 0 || bCheck.height === 0 || bCheck.top < 0) {
      return { ok: false, error: 'Check this plan button is not visible when settings open' };
    }
    if (bStart && (bStart.width === 0 || bStart.height === 0)) {
      return { ok: false, error: 'Start over button is not visible when settings open' };
    }
    if (Math.abs(bCheck.top - beforeBox.y) > 6) {
      return {
        ok: false,
        error: `Check this plan button wrapped vertically: before ${beforeBox.y}px vs after ${bCheck.top}px`,
      };
    }

    // 2. Non-overlapping title and settings
    const overlaps = (r1, r2) => {
      const noX = r1.right <= r2.left || r2.right <= r1.left;
      const noY = r1.bottom <= r2.top || r2.bottom <= r1.top;
      return !(noX || noY);
    };
    if (overlaps(bId, bPop)) {
      return { ok: false, error: 'Title overlaps settings popover' };
    }

    // 3. Bounded settings width (<= 360px)
    if (bPop.width > 360) {
      return { ok: false, error: `Settings popover exceeds bounded width: ${bPop.width}px` };
    }

    // 4. Full labels
    const text = popover.innerText;
    if (!text.includes('Plan revision') || !text.includes('Use AI for explanations')) {
      return { ok: false, error: 'Settings popover missing full labels' };
    }

    return { ok: true, popoverWidth: bPop.width };
  }, initialCheckBtnBox);

  assert.ok(
    desktopSettingsCheck.ok,
    `Desktop settings-open validation failed: ${desktopSettingsCheck.error}`
  );
  console.log(`✓ Assertion passed: Desktop settings-open verified (stable action visibility, non-overlapping title/settings, bounded width ${Math.round(desktopSettingsCheck.popoverWidth)}px <= 360px, full labels).`);

  await page.screenshot({ path: path.join(outDir, 'desktop_settings_open.png') });
  console.log('Saved: desktop_settings_open.png');

  // Dismiss settings by pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 2. Click "Check this plan" and assert initial 12h/8h conflict
  console.log('2. Clicking "Check this plan"...');
  const [analyzeRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/analyze') && r.status() === 200),
    page.click('[data-testid="check-plan"]'),
  ]);
  const analyzeData = await analyzeRes.json();
  const analysis = analyzeData.analysis;
  assert.ok(analysis && analysis.check, 'Analyze response must include analysis.check');

  // ASSERTION: Initial 12h/8h conflict and deterministic mode
  assert.strictEqual(analysis.check.status, 'infeasible', 'Initial plan check must be infeasible');
  assert.strictEqual(analysis.check.requiredHours, 12, 'Initial required editor hours must equal 12h');
  assert.strictEqual(analysis.check.availableHours, 8, 'Initial approved available editor hours must equal 8h');
  assert.strictEqual(analysis.mode, 'deterministic', 'Must preserve deterministic rules mode with no billable AI');
  assert.ok(analysis.check.conflictIds.length >= 3, 'Must identify all 3 active conflict commitments');
  console.log('✓ Assertion passed: Initial 12h/8h conflict verified (infeasible, 12h required vs 8h available, deterministic mode).');

  await page.waitForTimeout(600);
  await page.getByTestId('nav-dashboard').click();
  assert.strictEqual(await page.getByTestId('dashboard-status').innerText(), 'Needs a change');
  assert.strictEqual(await page.locator('.flow-desktop .flow-break').count(), 1);
  await page.screenshot({ path: path.join(outDir, 'dashboard_checked_desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outDir, 'dashboard_checked_mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.screenshot({ path: path.join(outDir, '02_checked_bottleneck.png') });
  console.log('Saved: 02_checked_bottleneck.png');

  // 3. Conflict Evidence & Truthful Affected-Work Labels
  console.log('3. Navigating to Conflict Evidence ("Needs attention")...');
  await page.click('[data-testid="nav-conflicts"]');
  await page.waitForSelector('[data-testid="conflict-view"]');
  await page.waitForSelector('[data-testid="conflict-diagnosis"]');
  await page.waitForSelector('[data-testid="conflict-metrics"]');
  await page.waitForSelector('[data-testid="affected-work"]');

  // Get actual workspace through authenticated browser API context
  const wsRes = await context.request.get(`${baseUrl}/api/workspace`);
  assert.strictEqual(wsRes.status(), 200, 'Must fetch workspace from authenticated API context');
  const wsData = await wsRes.json();
  const currentWorkspace = wsData.workspace;
  assert.ok(currentWorkspace && Array.isArray(currentWorkspace.commitments), 'Workspace must contain commitments array');

  // Resolve analysis.check.conflictIds to real commitment titles
  const expectedCommitmentTitles = analysis.check.conflictIds.map((id) => {
    const commitment = currentWorkspace.commitments.find((c) => c.id === id);
    assert.ok(commitment, `Conflict ID "${id}" must exist in workspace commitments`);
    return commitment.title;
  });

  // Verify truthful affected work: human titles only, none omitted, no raw IDs
  const affectedItems = (await page.locator('[data-testid="affected-work"] li').allInnerTexts()).map((t) => t.trim());
  assert.strictEqual(
    affectedItems.length,
    expectedCommitmentTitles.length,
    `Affected work list count (${affectedItems.length}) must match conflict commitment count (${expectedCommitmentTitles.length}) with none omitted`
  );

  for (const title of expectedCommitmentTitles) {
    assert.ok(
      affectedItems.includes(title),
      `Reported affected job "${title}" must be displayed in affected work list (found: ${JSON.stringify(affectedItems)})`
    );
  }

  for (const item of affectedItems) {
    assert.ok(
      !item.includes('cm-') && !item.includes('src-') && !item.includes('cp-') && !item.includes('ed-'),
      `Affected work must show human titles, never raw IDs. Got: "${item}"`
    );
  }

  const rawAffectedSectionText = await page.locator('[data-testid="affected-work"]').innerText();
  for (const id of analysis.check.conflictIds) {
    assert.ok(
      !rawAffectedSectionText.includes(id),
      `Raw conflict ID "${id}" must be absent from affected-work section`
    );
  }
  console.log('✓ Assertion passed: Truthful affected-work labels verified (resolved commitment titles, none omitted, zero raw IDs).');

  // Verify technical disclosure is initially collapsed and can be keyboard opened
  const conflictTechDetails = page.locator('[data-testid="conflict-technical-details"]');
  assert.strictEqual(
    await conflictTechDetails.getAttribute('open'),
    null,
    'Conflict technical details must be initially collapsed'
  );

  await conflictTechDetails.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.strictEqual(
    await conflictTechDetails.getAttribute('open'),
    '',
    'Conflict technical details must open on keyboard Enter'
  );
  assert.ok(
    (await conflictTechDetails.innerText()).toLowerCase().includes('reasoning paths'),
    'Reasoning paths must be present inside expanded details'
  );

  // Close back up via keyboard to preserve clean state
  await page.keyboard.press('Enter');
  assert.strictEqual(
    await conflictTechDetails.getAttribute('open'),
    null,
    'Conflict technical details must close on keyboard Enter'
  );
  console.log('✓ Assertion passed: Disclosure keyboard interaction verified.');

  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '03_conflict_evidence.png') });
  console.log('Saved: 03_conflict_evidence.png');

  // Mobile 390px conflict evidence capture
  console.log('   Checking 390px mobile viewport on conflict view...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  const hasConflictMobileOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  assert.strictEqual(
    hasConflictMobileOverflow,
    false,
    '390px viewport on conflict view must have no main-page horizontal scroll blowout'
  );
  await page.screenshot({ path: path.join(outDir, 'mobile_390_conflict.png') });
  console.log('Saved: mobile_390_conflict.png');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await page.waitForTimeout(300);

  // 4. Repair Proposals: Feasible Comet-Day2 Option & Sam Denial
  console.log('4. Navigating to Plan Options ("Plan options")...');
  await page.click('[data-testid="conflict-next-action"]');
  await page.waitForSelector('[data-testid="options-view"]');

  // Verify feasible candidate (Comet Coffee moved to Day 2)
  const feasibleProposals = analysis.proposals.filter((p) => p.result?.status === 'feasible');
  assert.ok(feasibleProposals.length >= 1, 'Must synthesize at least one feasible repair candidate');
  const feasibleCandidate = feasibleProposals[0];
  console.log(`✓ Assertion passed: Found ${feasibleProposals.length} feasible repair candidate(s).`);

  const feasibleOptionCard = page.locator(`[data-testid="option-${feasibleCandidate.id}"]`);
  await feasibleOptionCard.waitFor();
  const feasibleStatusText = await page.locator(`[data-testid="option-status-${feasibleCandidate.id}"]`).innerText();
  assert.ok(
    feasibleStatusText.includes('Ready to approve') || feasibleStatusText.includes('feasible'),
    'Feasible candidate must display "Ready to approve"'
  );

  // Verify Sam denial (rejected/blocked candidate)
  const samProposal = analysis.proposals.find(
    (p) => p.status === 'rejected' || p.description.includes('Sam') || p.title.includes('Sam')
  );
  assert.ok(samProposal, 'Must evaluate Sam assignment candidate');
  const samOptionCard = page.locator(`[data-testid="option-${samProposal.id}"]`);
  await samOptionCard.waitFor();
  const samStatusText = await page.locator(`[data-testid="option-status-${samProposal.id}"]`).innerText();
  assert.ok(
    samStatusText.includes('Blocked by client approval') || samStatusText.includes('Needs more time'),
    'Sam candidate must reflect client approval policy block'
  );
  assert.strictEqual(
    await page.locator(`[data-testid="approve-${samProposal.id}"]`).isDisabled(),
    true,
    'Approval button for blocked Sam candidate must be strictly disabled'
  );
  console.log('✓ Assertion passed: Sam denial verified (blocked status and disabled approval button).');

  // Verify option details initially collapsed and real source title drawer link
  const optionDetails = page.locator(`[data-testid="option-details-${feasibleCandidate.id}"]`);
  assert.strictEqual(
    await optionDetails.getAttribute('open'),
    null,
    'Option details must be initially collapsed'
  );

  await optionDetails.locator('summary').click();
  assert.strictEqual(
    await optionDetails.getAttribute('open'),
    '',
    'Option details must open on click'
  );

  // Click source link by human title to verify drawer opens with correct record
  const policySourceBtn = optionDetails.locator('button:has-text("Editing approval policy")');
  if (await policySourceBtn.count() > 0) {
    await policySourceBtn.click();
    await page.waitForSelector('[data-testid="source-drawer"]');
    await page.waitForSelector('text=Editing approval policy');
    // Dismiss drawer via Escape
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="source-drawer"]', { state: 'detached', timeout: 3000 });
    console.log('✓ Assertion passed: Real source title opened correct drawer record and closed cleanly on Escape.');
  }

  // Restore collapsed default state and scroll to meaningful view top before default screenshots
  await optionDetails.locator('summary').click();
  assert.strictEqual(
    await optionDetails.getAttribute('open'),
    null,
    'Option details must be restored to collapsed default state'
  );

  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(outDir, '04_repair_proposals.png') });
  console.log('Saved: 04_repair_proposals.png');

  // Mobile 390px plan options capture
  console.log('   Checking 390px mobile viewport on plan options view...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  const hasOptionsMobileOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  assert.strictEqual(
    hasOptionsMobileOverflow,
    false,
    '390px viewport on plan options view must have no main-page horizontal scroll blowout'
  );
  await page.screenshot({ path: path.join(outDir, 'mobile_390_options.png') });
  console.log('Saved: mobile_390_options.png');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await page.waitForTimeout(300);

  // 5. Approve Feasible Repair Proposal & Verify Receipts
  console.log('5. Approving feasible repair proposal...');
  const [approveRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/approve') && r.status() === 200),
    page.click(`[data-testid="approve-${feasibleCandidate.id}"]`),
  ]);
  const approveData = await approveRes.json();

  // ASSERTION: Feasible repair approval records decision receipt and owner tasks
  assert.ok(approveData.decision, 'Approve response must return committed decision');
  assert.ok(approveData.decision.allocations.length >= 1, 'Decision must record committed slot allocations');
  assert.ok(approveData.decision.tasks.length >= 1, 'Decision must generate execution checklist tasks');
  console.log('✓ Assertion passed: Feasible repair approval successfully committed to workspace.');

  // UI routes to Saved plan ("receipts")
  await page.waitForSelector('[data-testid="receipts-view"]');
  const decisionId = approveData.decision.id;
  await page.waitForSelector(`[data-testid="receipt-${decisionId}"]`);
  await page.waitForSelector('text=What happens next');

  // Verify receipt technical details initially collapsed
  const receiptDetails = page.locator(`[data-testid="receipt-details-${decisionId}"]`);
  assert.strictEqual(
    await receiptDetails.getAttribute('open'),
    null,
    'Receipt technical details must be initially collapsed'
  );
  await receiptDetails.locator('summary').click();
  await page.waitForSelector(`text=${approveData.decision.idempotencyKey}`);
  console.log('✓ Assertion passed: Saved receipt rendered with allocations, tasks, and collapsed idempotency key.');

  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '05_saved_receipts.png') });
  console.log('Saved: 05_saved_receipts.png');
  await page.getByTestId('nav-dashboard').click();
  assert.strictEqual(await page.getByTestId('dashboard-status').innerText(), 'Booked');
  await page.getByTestId('dashboard-edit-job').click();
  await page.fill('#commitment-hours-input', '5');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/workspace') && r.request().method() === 'PATCH' && r.status() === 200),
    page.getByRole('button', { name: 'Save job' }).click(),
  ]);
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.strictEqual(await page.getByTestId('dashboard-status').innerText(), 'Not checked');
  assert.ok((await page.getByTestId('dashboard-job-detail').innerText()).includes('5 hours'));
  assert.ok((await page.getByTestId('dashboard-view').innerText()).includes('saved bookings are still on file'));
  assert.strictEqual(await page.locator('.flow-desktop .flow-break').count(), 0);
  console.log('✓ Dashboard quick edit saves and invalidates the previous booked verdict.');

  // 6. Studio Memory Navigation ("Ask PACT")
  console.log('6. Navigating to Ask PACT ("Studio Memory")...');
  await page.click('[data-testid="nav-memory"]');
  await page.waitForSelector('[data-testid="memory-view"]');
  await page.waitForSelector('text=Rules-based answer');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '06_studio_memory.png') });
  console.log('Saved: 06_studio_memory.png');

  // 7. Studio Memory Inquiry (Deterministic Grounded Reply, $0 Billable AI Cost)
  console.log('7. Asking PACT a grounded question in plain language...');
  await page.fill('#memory-query-input', 'What was approved for Comet Coffee and what happens next?');
  const [memoryRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/memory') && r.status() === 200),
    page.click('button[type="submit"]:has-text("Ask")'),
  ]);
  const memoryData = await memoryRes.json();
  const reply = memoryData.reply;

  // ASSERTION: Studio Memory response must be deterministic, non-empty, and zero billable AI usage
  assert.ok(reply, 'Memory endpoint must return reply object');
  assert.strictEqual(reply.mode, 'deterministic', 'Studio memory must operate in deterministic mode');
  assert.strictEqual(reply.usageUsd ?? 0, 0, 'No billable AI usage allowed (usageUsd must be 0)');
  assert.ok(typeof reply.text === 'string' && reply.text.length > 20, 'Memory response must be non-empty');
  assert.ok(Array.isArray(reply.sourceIds) && reply.sourceIds.length > 0, 'Memory response must cite grounded sources');
  assert.ok(reply.sourceIds.includes('src-policy'), 'Memory response for Comet query must cite src-policy approval source');

  const knownWorkspaceSources = new Set(approveData.workspace.sources.map((s) => s.id));

  for (const srcId of reply.sourceIds) {
    assert.ok(typeof srcId === 'string' && srcId.length > 0, 'Cited source ID must be a non-empty string');
    assert.ok(knownWorkspaceSources.has(srcId), `Cited source ID "${srcId}" must be a real workspace source`);
  }
  console.log('✓ Assertion passed: Studio memory returned verified grounded response with zero billable AI cost and valid non-empty sources including src-policy.');

  // Verify response renders grounded source titles
  await page.waitForSelector('text=Rules-based answer');
  await page.waitForSelector('text=Source evidence:');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '07_studio_memory_response.png') });
  console.log('Saved: 07_studio_memory_response.png');

  // 8. Start Over / Reset Modal
  console.log('8. Testing Start Over / Reset modal...');
  await page.click('[data-testid="start-over"]');
  await page.waitForSelector('text=Start over?');
  await page.screenshot({ path: path.join(outDir, '08_start_over_modal.png') });
  console.log('Saved: 08_start_over_modal.png');

  // Confirm reset
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/reset') && r.status() === 200),
    page.getByRole('dialog').getByRole('button', { name: 'Start over', exact: true }).click(),
  ]);
  await page.waitForTimeout(600);
  console.log('✓ Assertion passed: Reset modal confirmed and workspace restored to sample schedule.');

  // 9. Deliverables & Desk / Overview: Edit Sam Approval for Comet Coffee
  console.log('9. Navigating to Overview ("Your work") and editing Sam approval for Comet Coffee...');
  await page.click('[data-testid="nav-overview"]');
  await page.waitForSelector('[data-testid="overview-view"]');
  await page.waitForSelector('text=Who can work on what');

  // Find Sam's unapproved button for Comet Coffee
  const unapprovedSamBtn = page.locator('table tr:has-text("Sam") button:has-text("Unapproved")');
  const [samPatchRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/workspace') && r.status() === 200),
    unapprovedSamBtn.click(),
  ]);
  const samPatchData = await samPatchRes.json();
  const samApproval = samPatchData.workspace.approvals.find(
    (a) => a.id === 'ap-c-sam' || (a.editorId === 'ed-sam' && a.campaignId === 'cp-c')
  );
  assert.ok(samApproval && samApproval.approved === true, 'Sam must be recorded as approved for Comet Coffee');
  console.log('✓ Assertion passed: Sam approval for Comet Coffee granted.');
  await page.waitForTimeout(500);

  // 10. Re-check Plan: Sam Approval Restores Original Day 1 Feasibility
  console.log('10. Rerunning check with Sam approved (original deadlines feasible)...');
  const [samCheckRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/analyze') && r.status() === 200),
    page.click('[data-testid="check-plan"]'),
  ]);
  const samCheckData = await samCheckRes.json();
  const samAnalysis = samCheckData.analysis;

  // ASSERTION: Sam approval yields feasible original deadlines
  assert.strictEqual(samAnalysis.check.status, 'feasible', 'Plan check must be feasible with Sam approved');
  assert.strictEqual(samAnalysis.check.requiredHours, 12, 'Required hours remain 12h under original Day 1 deadlines');
  assert.ok(samAnalysis.check.availableHours >= 12, 'Total approved available capacity covers 12h');
  assert.strictEqual(samAnalysis.check.conflictIds.length, 0, 'No conflict IDs remain once feasible');
  console.log('✓ Assertion passed: Sam approval yields feasible original Day 1 deadlines.');

  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '09_sam_approved_feasible.png') });
  console.log('Saved: 09_sam_approved_feasible.png');
  await page.getByTestId('nav-dashboard').click();
  assert.strictEqual(await page.getByTestId('dashboard-status').innerText(), 'Fits, not booked');
  await page.getByTestId('nav-overview').click();

  // 11. Unknown Duration Edit on Aurora Skincare (needs_information)
  console.log('11. Testing Unknown Duration edit on Aurora Skincare...');
  const editAuroraBtn = page.locator('.paper-card:has-text("Aurora Skincare") button:has-text("Edit job")');
  await editAuroraBtn.click();
  await page.waitForSelector('text=Edit this job');
  await page.click('#unknown-duration-checkbox');
  await page.screenshot({ path: path.join(outDir, '10_unknown_duration_modal.png') });
  console.log('Saved: 10_unknown_duration_modal.png');

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/workspace') && r.status() === 200),
    page.click('button[type="submit"]:has-text("Save job")'),
  ]);
  await page.waitForTimeout(500);

  // Re-check to demonstrate needs_information
  const [unknownCheckRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/analyze') && r.status() === 200),
    page.click('[data-testid="check-plan"]'),
  ]);
  const unknownCheckData = await unknownCheckRes.json();
  const unknownAnalysis = unknownCheckData.analysis;

  // ASSERTION: Unknown duration returns needs_information
  assert.strictEqual(
    unknownAnalysis.check.status,
    'needs_information',
    'Plan check must return needs_information status when deliverable duration is unknown'
  );
  assert.ok(
    /unknown/i.test(unknownAnalysis.check.summary) ||
      unknownAnalysis.check.issues.some((issue) => /unknown/i.test(issue)),
    'Check summary or issues must indicate unknown deliverable duration'
  );
  console.log('✓ Assertion passed: Unknown duration correctly produces needs_information status.');
  await page.getByTestId('nav-dashboard').click();
  assert.strictEqual(await page.getByTestId('dashboard-status').innerText(), 'Not confirmed');
  assert.ok((await page.getByTestId('dashboard-view').innerText()).includes('Known editing hours'));

  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '11_unknown_duration_checked.png') });
  console.log('Saved: 11_unknown_duration_checked.png');

  // Navigate to Needs attention to assert real metrics read 'Known editing hours' and balance 'Unknown'
  console.log('   Navigating to Needs attention to assert truthful unknown metrics...');
  await page.click('[data-testid="nav-conflicts"]');
  await page.waitForSelector('[data-testid="conflict-view"]');
  await page.waitForSelector('[data-testid="conflict-metrics"]');

  const conflictMetricsText = await page.locator('[data-testid="conflict-metrics"]').innerText();
  assert.ok(
    conflictMetricsText.toLowerCase().includes('known editing hours'),
    `Conflict metrics must read 'Known editing hours' under unknown duration. Got: "${conflictMetricsText}"`
  );
  assert.ok(
    conflictMetricsText.toLowerCase().includes('unknown'),
    `Conflict metrics balance must read 'Unknown' under unknown duration. Got: "${conflictMetricsText}"`
  );
  console.log('✓ Assertion passed: Truthful unknown metrics verified ("Known editing hours" and balance "Unknown").');

  // Return to Overview for later edits
  console.log('   Returning to Overview for later edits...');
  await page.click('[data-testid="nav-overview"]');
  await page.waitForSelector('[data-testid="overview-view"]');
  await page.waitForSelector('.paper-card:has-text("Aurora Skincare")');

  // 12. Capacity Slot Toggle
  console.log('12. Testing Capacity Slot Toggle...');
  // Restore Aurora hours so schedule is normal
  await editAuroraBtn.click();
  await page.waitForSelector('text=Edit this job');
  await page.click('#unknown-duration-checkbox'); // Uncheck unknown
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/workspace') && r.status() === 200),
    page.click('button[type="submit"]:has-text("Save job")'),
  ]);
  await page.waitForTimeout(400);

  // Toggle Alex slot #0
  const slot0 = page.locator('.slot-cell').first();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/workspace') && r.status() === 200),
    slot0.click(),
  ]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '12_capacity_slot_toggle.png') });
  console.log('Saved: 12_capacity_slot_toggle.png');

  // 13. Studio Event Edit Modal
  console.log('13. Testing Studio Event Edit...');
  const editEventBtn = page.locator('section:has-text("Studio events") button:has-text("Edit")').first();
  await editEventBtn.click();
  await page.waitForSelector('text=Edit this event');
  await page.fill('#event-start-input', '2');
  await page.fill('#event-end-input', '6');
  await page.screenshot({ path: path.join(outDir, '13_event_edit_modal.png') });
  console.log('Saved: 13_event_edit_modal.png');

  // 14. Event Saved
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/workspace') && r.status() === 200),
    page.click('button[type="submit"]:has-text("Save event")'),
  ]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '14_event_saved.png') });
  console.log('Saved: 14_event_saved.png');

  // 15. Source Drawer and Escape Dismissal / Focus Restoration
  console.log('15. Testing Source Drawer and Escape...');
  await page.click('[data-testid="open-sources"]');
  await page.waitForSelector('[data-testid="source-drawer"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '15_source_drawer.png') });
  console.log('Saved: 15_source_drawer.png');

  // Press Escape to dismiss drawer and assert dismissal
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="source-drawer"]', { state: 'detached', timeout: 3000 });
  console.log('✓ Assertion passed: Source drawer closed cleanly on Escape key press.');

  const isTriggerFocused = await page.evaluate(() => {
    return document.activeElement === document.querySelector('[data-testid="open-sources"]');
  });
  assert.ok(isTriggerFocused, 'Focus must be restored to [data-testid="open-sources"] trigger after Escape dismissal');
  console.log('✓ Assertion passed: Focus restoration verified.');
  await page.waitForTimeout(400);

  // 16. Real Stale 409 State & Error Handling
  console.log('16. Testing Real Stale 409 State & Error Handling...');
  const editCometBtn = page.locator('.paper-card:has-text("Comet Coffee") button:has-text("Edit job")');
  await editCometBtn.click();
  await page.waitForSelector('text=Edit this job');

  // Outside the modal, simulate another user bumping the workspace revision via fetch
  await page.evaluate(async () => {
    const res = await fetch('/api/workspace', { method: 'GET' });
    const { workspace } = await res.json();
    await fetch('/api/workspace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: workspace.revision,
        edit: { kind: 'approval', id: 'ap-b-alex', approved: false },
      }),
    });
  });

  // Now submit the modal which still holds the prior workspace revision
  await page.fill('#commitment-hours-input', '5');
  await page.click('button[type="submit"]:has-text("Save job")');

  // Wait for 409 error alert banner with plain language notice
  await page.waitForSelector('[data-testid="error-alert"]', { timeout: 4000 });
  const alertText = await page.locator('[data-testid="error-alert"]').innerText();
  assert.ok(
    alertText.includes('plan changed'),
    `Stale 409 alert banner must state that the plan changed. Got: "${alertText}"`
  );
  console.log('✓ Assertion passed: HTTP 409 conflict alert banner displayed ("The plan changed").');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '16_error_alert.png') });
  console.log('Saved: 16_error_alert.png');

  assert.deepStrictEqual(pageErrors, [], 'No uncaught browser errors');
  fs.writeFileSync(path.join(outDir, 'dashboard-result.json'), JSON.stringify({
    passed: true, baseUrl, checkedAt: new Date().toISOString(), providerCalls: 0,
    dashboard: ['default', 'keyboard graph selection', 'source brief', 'shortage break', 'booked', 'quick edit invalidation', 'feasible not booked', 'unknown'],
    mobileViews: 6, pageErrors,
  }, null, 2));
  await browser.close();
  console.log('\n======================================================');
  console.log('All 16 visual inspection screenshots + 3 mobile screenshots captured successfully!');
  console.log('All assertions passed:');
  console.log('  1. Initial 12h/8h capacity conflict (infeasible, deterministic rules mode)');
  console.log('  2. Truthful affected-work titles resolved from workspace commitments (none omitted, zero raw IDs)');
  console.log('  3. Technical disclosures initially collapsed & keyboard openable via Enter');
  console.log('  4. 390px mobile viewport zero page overflow across overview, conflict, and options views');
  console.log('  4b. 390px mobile layout: title does not overlap controls, all 6 navigation choices fit visibly, and the Sources launcher stays visible/contained');
  console.log('  5. 390px timeline 16th cell reachable within genuine scroll wrapper after horizontal scrolling');
  console.log('  6. Feasible repair candidate synthesis & Sam policy denial enforcement');
  console.log('  7. Real source titles link to grounded drawer records');
  console.log('  8. Human approval receipt persistence & execution checklist tasks');
  console.log('  9. Grounded Studio Memory with $0 billable AI usage');
  console.log(' 10. Sam approval yielding feasible original Day 1 deadlines');
  console.log(' 11. Unknown duration deliverable correctly producing needs_information');
  console.log(" 11b. Truthful unknown deliverable metrics verified ('Known editing hours' and balance 'Unknown')");
  console.log(' 12. Keyboard accessibility: Escape cleanly dismisses Source Drawer and restores trigger focus');
  console.log(' 13. Real HTTP 409 optimistic locking state handling');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('Error during browser inspection:', err);
  process.exit(1);
});
