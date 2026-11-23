import { expect, test as base, type Locator, type Page } from '@playwright/test';

// Keep every run local even if a deployed signup URL is present in .env.local.
const test = base.extend<{ browserSafety: void }>({
  browserSafety: [async ({ page }, use) => {
    const errors: string[] = [];
    const signupRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route((url) => url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com', async (route) => {
      signupRequests.push(route.request().url());
      await route.fulfill({ json: { ok: true }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    // Fulfill the analytics loader locally so blocked requests add no console noise.
    await page.route((url) => /(^|\.)(googletagmanager|google-analytics)\.com$/.test(url.hostname), (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await use();
    expect(signupRequests, 'Browsing and opening CTAs must not save a signup').toEqual([]);
    expect(errors, 'Learner page must have no browser or console errors').toEqual([]);
  }, { auto: true }],
});

async function visit(page: Page) {
  await page.goto('/');
  await expect(page.locator('#features [data-tabs]')).toHaveAttribute('data-active', '0');
  await page.waitForFunction(() => document.querySelector('#features [data-tabs] [role="tabpanel"]:not([hidden])') !== null);
}

async function assertTab(root: Locator, label: string) {
  const tab = root.getByRole('tab', { name: label });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab).toHaveAttribute('tabindex', '0');
  await expect(root.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(root.locator('[role="tabpanel"]:visible')).toHaveCount(1);
  const controls = await tab.getAttribute('aria-controls');
  await expect(root.locator(`[id="${controls}"]`)).toBeVisible();
}

test('learner sections, approved copy, comparison and CTAs are complete', async ({ page }) => {
  await visit(page);
  const main = page.locator('main');
  expect(await main.locator(':scope > section').evaluateAll((sections) => sections.map((section) => section.id))).toEqual(['hero', 'features', 'evaluates', 'compare', 'team']);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Get your MI session evaluated. See the evidence for every score.');
  await expect(page.locator('#hero [data-hero-signup]')).toHaveCount(1);
  await expect(page.locator('#features')).toContainText('Results in minutes, not the 1 to 2 weeks human coding takes.');
  await expect(page.locator('#evaluates article')).toHaveCount(6);
  await expect(page.locator('#evaluates article').nth(2)).toContainText('Summary scores checked against MITI fair/good levels.');
  expect(await main.evaluate((element) => element.lastElementChild?.id)).toBe('team');
  expect(await main.evaluate((element) => element.nextElementSibling?.tagName)).toBe('FOOTER');
  await expect(page.locator('footer')).toContainText('Not official MITI coding');
  await expect(page.locator('footer')).not.toContainText('cannot be submitted as one');
  await expect(page.locator('footer')).not.toContainText('Questions?');
  await expect(page.locator('footer a[href="https://app.onolys.com/privacy"]')).toHaveText('Privacy');
  await expect(page.locator('footer a[href="https://app.onolys.com/terms"]')).toHaveText('Terms');
  await expect(page.locator('footer a[href="/enterprise"]')).toHaveCount(1);
  await expect(page.locator('footer')).not.toContainText('Note:');
  for (const section of ['features', 'evaluates', 'compare']) {
    const cta = page.locator(`#${section} .cta-row > [data-open-popup]`);
    await expect(cta).toHaveAttribute('data-trigger', `section:${section}`);
    await cta.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  }
});

test('desktop comparison table has the new rows, values and column widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page);
  const table = page.locator('#compare table');
  await expect(table).toBeVisible();
  await expect(page.locator('#compare [data-compare-mobile]')).toBeHidden();
  await expect(table.locator('thead th')).toHaveText(['Criterion', 'Human MITI coding', 'Practice simulators', 'Onolys']);
  await expect(table.locator('tbody th')).toHaveText(['Your own session', 'Full MITI 4.2.1 coding', 'Evidence for every score', 'Session length', 'Cost', 'Turnaround']);
  await expect(table.locator('tbody [data-value]')).toHaveText([
    'Yes', 'Simulated client', 'Yes',
    'Yes', 'Varies', 'Yes',
    'Sometimes', 'Rarely', 'Yes',
    'Full session', 'Limited, short chats', 'Full session',
    '$40–$80 per session', 'Monthly subscription', 'Low (pricing coming soon)',
    'About 1 to 2 weeks', '—', 'Minutes',
  ]);
  const widths = await table.locator('thead th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBe(widths[0]);
  expect(Math.max(...widths)).toBe(widths[3]);
});

test('features section fits one 1440x900 viewport below the sticky header and panels are static', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page);
  const height = await page.locator('#features').evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(835);
  const root = page.locator('#features [data-tabs]');
  for (const label of ['See your full MITI score', 'Know why each score was given', 'Learn what to improve next']) {
    await root.getByRole('tab', { name: label }).click();
    await assertTab(root, label);
    const panel = root.locator('[role="tabpanel"]:visible');
    expect(await panel.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    expect(await panel.evaluate((el) => Array.from(el.querySelectorAll('*')).some((child) => ['auto', 'scroll'].includes(getComputedStyle(child).overflowY)))).toBe(false);
  }
  // Tab headings keep order; active tab connects to the panel (no border between).
  await expect(root.locator('[role="tab"] .h')).toHaveText(['See your full MITI score', 'Know why each score was given', 'Learn what to improve next']);
  const active = await root.locator('[role="tab"][aria-selected="true"]').evaluate((el) => getComputedStyle(el).borderRightWidth);
  expect(active).toBe('0px');
});

test('feature tabs support arrow keys, Home and End with focus', async ({ page }) => {
  await visit(page);
  const root = page.locator('#features [data-tabs]');
  const names = ['See your full MITI score', 'Know why each score was given', 'Learn what to improve next'];
  await root.getByRole('tab', { name: names[0] }).focus();
  await page.keyboard.press('ArrowDown');
  await assertTab(root, names[1]);
  await expect(root.getByRole('tab', { name: names[1] })).toBeFocused();
  await expect(root.getByRole('tabpanel', { name: names[1] })).toContainText('Every score points to the lines behind it.');
  await page.keyboard.press('ArrowRight');
  await assertTab(root, names[2]);
  await expect(root.getByRole('tabpanel', { name: names[2] })).toContainText('Ask fewer closed questions');
  for (const [key, index] of [['Home', 0], ['End', 2], ['ArrowLeft', 1], ['ArrowUp', 0], ['ArrowLeft', 2], ['ArrowRight', 0]] as const) {
    await page.keyboard.press(key);
    await assertTab(root, names[index]);
    await expect(root.getByRole('tab', { name: names[index] })).toBeFocused();
  }
});

test('team cards align bios and LinkedIn icons at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page);
  const cards = page.locator('#team article');
  await expect(cards).toHaveCount(3);
  const tops = await cards.locator('.bio').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const links = await cards.locator('.linkedin').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(links).size).toBe(1);
  const bioBottom = await cards.locator('.bio').first().evaluate((el) => el.getBoundingClientRect().bottom);
  expect(links[0]).toBeGreaterThanOrEqual(bioBottom);
  const left = await cards.first().evaluate((card) => [card.querySelector('.bio')!.getBoundingClientRect().left, card.querySelector('.linkedin')!.getBoundingClientRect().left]);
  expect(Math.abs(left[0] - left[1])).toBeLessThanOrEqual(1);
  await expect(page.locator('#team .bio strong')).toHaveText(['Engineer at Microsoft', 'AI Researcher and Data Scientist at Bing Search', 'Clinical neuropsychologist']);
  await expect(page.locator('#team')).not.toContainText(/she\/her|Questions\?/);
  await expect(page.locator('#team a[href^="mailto:"]')).toHaveCount(0);
  await page.locator('#team').scrollIntoViewIfNeeded();
  await expect.poll(() => cards.locator('img').evaluateAll((els) => els.every((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const boxes = await cards.locator('img').evaluateAll((els) => els.map((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height, (el as HTMLImageElement).naturalWidth]));
  for (const [w, h, nat] of boxes) {
    expect([w, h]).toEqual([104, 104]);
    expect(nat).toBeGreaterThanOrEqual(208);
  }
  // each footer list is one line on desktop
  for (const list of await page.locator('footer ul').all()) {
    const tops = await list.locator('li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  }
});

test('390px: no horizontal scroll, compare tabs switch, compact team cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page);
  expect(await page.locator('#team img').first().evaluate((el) => el.getBoundingClientRect().width)).toBe(76);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const features = page.locator('#features [data-tabs]');
  await expect(features.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
  for (const label of ['See your full MITI score', 'Know why each score was given', 'Learn what to improve next']) {
    await features.getByRole('tab', { name: label }).click();
    await assertTab(features, label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), label).toBe(true);
  }
  await expect(page.locator('#compare table')).toBeHidden();
  const cmp = page.locator('#compare [data-compare-mobile]');
  await expect(cmp.getByRole('tab')).toHaveText(['Human coding', 'Simulators', 'Onolys']);
  await assertTab(cmp, 'Onolys');
  const rows = cmp.locator('[role="tabpanel"]:visible [data-row]');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(4)).toContainText('Low (pricing coming soon)');
  await cmp.getByRole('tab', { name: 'Human coding' }).click();
  await assertTab(cmp, 'Human coding');
  await expect(rows.nth(4)).toContainText('$40–$80 per session');
  await cmp.getByRole('tab', { name: 'Simulators' }).focus();
  await page.keyboard.press('ArrowRight');
  await assertTab(cmp, 'Onolys');
  await cmp.getByRole('tab', { name: 'Simulators' }).click();
  await expect(rows.nth(5)).toContainText('—');
  const photo = await page.locator('#team article img').first().boundingBox();
  expect(photo!.width).toBeLessThanOrEqual(76);
  const card = await page.locator('#team article').first().boundingBox();
  expect(card!.height).toBeLessThan(200);
});
