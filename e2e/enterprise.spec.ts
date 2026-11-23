import { expect, test as base, type Locator, type Page } from '@playwright/test';

type Payload = { step: number; page: string; [key: string]: unknown };
const test = base.extend<{ signupRequests: Payload[] }>({
  signupRequests: [async ({ page }, use) => {
    const errors: string[] = [];
    const requests: Payload[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    // Intercept entire Apps Script hosts, including any real URL in local env files.
    await page.route((url) => ['script.google.com', 'script.googleusercontent.com'].includes(url.hostname), async (route) => {
      if (route.request().method() === 'POST') requests.push(route.request().postDataJSON() as Payload);
      await route.fulfill({ json: { ok: true }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.route((url) => /(^|\.)(googletagmanager|google-analytics)\.com$/.test(url.hostname), (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await use(requests);
    expect(errors, 'Enterprise browsing must produce no browser or console errors').toEqual([]);
  }, { auto: true }],
});

async function visit(page: Page) {
  await page.goto('/enterprise?src=enterprise-test');
  await expect(page.locator('#features [data-tabs]')).toHaveAttribute('data-active', '0');
}

async function assertTab(root: Locator, label: string) {
  const tab = root.getByRole('tab', { name: label });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(root.locator('[role="tabpanel"]:visible')).toHaveCount(1);
  await expect(root.locator(`[id="${await tab.getAttribute('aria-controls')}"]`)).toBeVisible();
}

test('enterprise sections, exact copy, comparison and trailing CTAs are complete', async ({ page, signupRequests }) => {
  await visit(page);
  const main = page.locator('main');
  expect(await main.locator(':scope > section').evaluateAll((sections) => sections.map(({ id }) => id))).toEqual(['hero', 'benefits', 'features', 'evaluates', 'compare', 'team']);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quality-check your MITI coding. Every score, backed by the session.');
  await expect(page.locator('#hero')).toContainText("We read each coded sample against its transcript and flag the scores the session doesn't support, with line references.");
  await expect(page.locator('#hero')).not.toContainText('not official MITI coding');
  await expect(page.locator('.hero-limits')).toHaveCount(0);
  await expect(page.locator('#hero [data-hero-signup]')).toHaveCount(1);
  await expect(page.locator('#hero [data-open-popup]')).toHaveCount(0);
  await expect(page.locator('#benefits article h3')).toHaveText(['Bulk evaluations', 'Quality control', 'Fast turnaround']);
  await expect(page.locator('#benefits article p')).toHaveText([
    'Volume pricing for evaluating many samples across your team or program.',
    'Check each coded sample against its transcript. Unsupported scores are flagged with lines, which also shows new coders where they drift.',
    'Flags arrive in minutes, so second coding focuses only on disputed scores.',
  ]);
  expect(await main.evaluate((element) => element.lastElementChild?.id)).toBe('team');
  expect(await main.evaluate((element) => element.nextElementSibling?.tagName)).toBe('FOOTER');
  await expect(page.locator('footer a[href="/"]')).toHaveText('Individuals');
  await expect(page.locator('footer')).not.toContainText('Questions?');
  await expect(main).not.toContainText(/\$|accura|replace/i);
  await expect(page.locator('#features')).not.toContainText('Results in minutes, not the 1 to 2 weeks human coding takes.');

  const table = page.locator('#compare table');
  await expect(table.locator('thead th')).toHaveText(['Criterion', 'Second human coder', 'Onolys evidence check']);
  await expect(table.locator('tbody th')).toHaveText(['Checks every score', 'Points to the lines', 'Turnaround', 'Scales with volume']);
  await expect(table.locator('tbody [data-value]')).toHaveText(['Yes', 'Yes', 'Sometimes', 'Yes, linked lines', 'Days', 'Minutes', 'Needs more coders', 'Yes']);
  await expect(table.locator('tbody td[data-highlighted="true"] strong')).toHaveCount(4);
  await expect(page.locator('#evaluates article').nth(2)).toContainText('Summary scores checked against MITI fair/good levels.');
  for (const section of ['benefits', 'features', 'compare']) {
    const cta = page.locator(`#${section} .cta-row > [data-open-popup]`);
    await expect(cta).toHaveAttribute('data-trigger', `section:${section}`);
    await cta.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Organization', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Samples per month', { exact: true })).toBeVisible();
    await expect(dialog.locator('[name="how_often"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  await expect(page.locator('#evaluates .cta-row > [data-trigger="section:evaluates"]')).toHaveCount(1);
  expect(signupRequests).toEqual([]);
});

test('enterprise feature tabs: order, static panels, keyboard and 1440x900 fit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page);
  const root = page.locator('#features [data-tabs]');
  const names = ['See the full MITI score', "Flag scores the session doesn't support", 'Show coders where they drift'];
  await expect(root.locator('[role="tab"] .h')).toHaveText(names);
  expect(await page.locator('#features').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(835);
  await assertTab(root, names[0]);
  await expect(root.locator('[data-rating]')).toHaveCount(4);
  await root.getByRole('tab', { name: names[0] }).focus();
  await page.keyboard.press('ArrowDown');
  await assertTab(root, names[1]);
  const qc = root.getByRole('tabpanel', { name: names[1] });
  await expect(qc.locator('[data-qc-row] .tag')).toHaveText(['Unsupported', 'Supported', 'Supported']);
  await expect(qc.locator('[data-qc-row]').first()).toContainText('L12, L27');
  await page.keyboard.press('ArrowDown');
  await assertTab(root, names[2]);
  await expect(root.getByRole('tabpanel', { name: names[2] }).locator('[data-suggestion]')).toHaveCount(3);
  await page.keyboard.press('End');
  await assertTab(root, names[2]);
  await page.keyboard.press('Home');
  await assertTab(root, names[0]);
  for (const label of names) {
    await root.getByRole('tab', { name: label }).click();
    const panel = root.locator('[role="tabpanel"]:visible');
    expect(await panel.evaluate((el) => Array.from(el.querySelectorAll('*')).some((child) => ['auto', 'scroll'].includes(getComputedStyle(child).overflowY)))).toBe(false);
  }
});

test('enterprise CTA submits only the mocked step-2 enterprise context and fields', async ({ page, signupRequests }) => {
  await visit(page);
  await page.locator('#benefits .cta-row > [data-open-popup]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Organization', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Samples per month', { exact: true })).toBeVisible();
  await expect(dialog.locator('[name="how_often"]')).toHaveCount(0);
  await dialog.getByLabel('Email', { exact: true }).fill('qc-team@example.com');
  await dialog.getByLabel('Organization', { exact: true }).fill('Example QC team');
  await dialog.getByLabel('Samples per month', { exact: true }).selectOption('10 to 50');
  await dialog.getByRole('button', { name: 'Get early access', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Thank you for signing up.' })).toBeVisible();
  expect(signupRequests).toEqual([{
    step: 2, email: 'qc-team@example.com', page: 'enterprise', src: 'enterprise-test', honeypot: '',
    organization: 'Example QC team', samples_per_month: '10 to 50',
  }]);
});

test('enterprise is noindex and the learner page links to enterprise only via header and footer', async ({ page, request }) => {
  await visit(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('link[rel~="canonical"]')).toHaveCount(0);
  const response = await request.get('/');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('href="/enterprise"');
  await page.goto('/');
  await expect(page.locator('[href*="enterprise" i]')).toHaveCount(2);
  await expect(page.locator('header a[href="/enterprise"]')).toHaveText('Enterprise');
  await expect(page.locator('footer a[href="/enterprise"]')).toHaveCount(1);
});

test('390px: no horizontal scroll and the compare tabs switch between Second coder and Onolys', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const benefits = await page.locator('#benefits article').all();
  const boxes = await Promise.all(benefits.map((card) => card.boundingBox()));
  expect(boxes.every((box) => box && box.width > 250 && box.x + box.width <= 390)).toBe(true);
  const features = page.locator('#features [data-tabs]');
  for (const label of ["See the full MITI score", "Flag scores the session doesn't support", 'Show coders where they drift']) {
    await features.getByRole('tab', { name: label }).click();
    await assertTab(features, label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), label).toBe(true);
  }
  await expect(page.locator('#compare table')).toBeHidden();
  const cmp = page.locator('#compare [data-compare-mobile]');
  await expect(cmp.getByRole('tab')).toHaveText(['Second coder', 'Onolys']);
  await assertTab(cmp, 'Onolys');
  const values = cmp.locator('[role="tabpanel"]:visible [data-row] .v');
  await expect(values).toHaveText(['Yes', 'Yes, linked lines', 'Minutes', 'Yes']);
  await cmp.getByRole('tab', { name: 'Second coder' }).click();
  await assertTab(cmp, 'Second coder');
  await expect(values).toHaveText(['Yes', 'Sometimes', 'Days', 'Needs more coders']);
});

test('enterprise comparison table keeps its columns on desktop and team has no Questions link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page);
  const widths = await page.locator('#compare thead th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBe(widths[0]);
  expect(Math.max(...widths)).toBe(widths[2]);
  await expect(page.locator('#team a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.locator('#team')).not.toContainText('Questions?');
});
