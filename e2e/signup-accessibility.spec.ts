import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';
import { openPopup } from './open-popup';

const signupHost = (url: URL) => url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com';

test.beforeEach(async ({ page }) => {
  // These tests must remain safe even when .env.local contains the deployed endpoint.
  await page.route(signupHost, (route) => route.fulfill({ json: { ok: true }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route((url) => /(^|\.)(googletagmanager|google-analytics)\.com$/.test(url.hostname), (route) => route.abort());
});

for (const path of ['/', '/enterprise']) {
  test(`${path} dialog has labelled controls, visible focus, readable contrast and mobile targets`, async ({ page, isMobile }) => {
    await page.goto(path);
    await openPopup(page, 'topbar');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName('Get early access');
    const labels = await dialog.locator('input:not([name="company_website"]),select,textarea').evaluateAll((controls) => controls.map((control) => {
      const input = control as HTMLInputElement;
      return { name: input.name, labels: Array.from(input.labels ?? [], (label) => label.textContent?.trim()), required: input.required };
    }));
    expect(labels.every((control) => control.labels.length === 1 && Boolean(control.labels[0]))).toBe(true);
    expect(labels.filter((control) => control.required).map((control) => control.name)).toEqual(['email']);

    const email = dialog.getByRole('textbox', { name: 'Email', exact: true });
    await expect(email).toBeFocused();
    for (const control of [email, dialog.getByRole('button', { name: 'Close', exact: true }), dialog.getByRole('button', { name: 'Get early access', exact: true })]) {
      // Focus every target with the keyboard so :focus-visible is measured.
      for (let tabs = 0; tabs < labels.length + 3 && !(await control.evaluate((element) => element === document.activeElement)); tabs++) {
        await page.keyboard.press('Tab');
      }
      await expect(control).toBeFocused();
      const outline = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor };
      });
      expect(outline.width).toBeGreaterThanOrEqual(2);
      expect(outline.style).not.toBe('none');
      expect(outline.color).not.toBe('rgba(0, 0, 0, 0)');
    }

    // Include the visible validation message in the contrast measurements.
    await email.fill('invalid');
    await dialog.getByRole('button', { name: 'Get early access', exact: true }).click();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.locator('[data-email-error]')).toHaveText('Enter a valid email address.');
    const measurements = await dialog.evaluate((element) => {
      function luminance(color: string): number {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      }
      function contrast(foreground: string, background: string): number {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
      }
      const background = getComputedStyle(element).backgroundColor;
      const text = Array.from(element.querySelectorAll<HTMLElement>('h2,p,label,input,select,textarea,button')).filter((item) => item.getClientRects().length && !item.closest('[hidden],[inert]'));
      const ratios = text.map((item) => {
        const style = getComputedStyle(item);
        const fill = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? background : style.backgroundColor;
        return { name: item.textContent?.trim() || item.getAttribute('name'), ratio: contrast(style.color, fill) };
      });
      const targets = Array.from(element.querySelectorAll<HTMLElement>('button,input,select,textarea')).filter((item) => item.getClientRects().length && !item.closest('[hidden],[inert]')).map((item) => {
        const bounds = item.getBoundingClientRect();
        return { name: item.getAttribute('name') ?? item.textContent?.trim(), width: bounds.width, height: bounds.height };
      });
      return { ratios, targets };
    });
    for (const measurement of measurements.ratios) expect(measurement.ratio, measurement.name ?? '').toBeGreaterThanOrEqual(4.5);
    if (isMobile) {
      for (const target of measurements.targets) {
        expect(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
        expect(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
      }
    }
    console.log(`${path} ${isMobile ? 'mobile' : 'desktop'}: minimum contrast ${Math.min(...measurements.ratios.map(({ ratio }) => ratio)).toFixed(2)}:1; minimum target ${Math.min(...measurements.targets.map(({ width }) => width))}×${Math.min(...measurements.targets.map(({ height }) => height))}px`);

  });
}

test('success reopens fresh and the entire flow writes no browser storage or cookies', async ({ page, context }) => {
  const writes: string[] = [];
  page.on('console', (message) => { if (message.text().startsWith('signup-storage-write:')) writes.push(message.text()); });
  await page.addInitScript(() => {
    for (const method of ['setItem', 'removeItem', 'clear'] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: function (...args: string[]) {
        console.debug(`signup-storage-write:${method}`);
        return Reflect.apply(original, this, args);
      } });
    }
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get: cookie.get, set(value: string) {
      console.debug('signup-storage-write:cookie');
      cookie.set!.call(this, value);
    } });
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.gtag === 'function');
  await openPopup(page, 'hero', { email: 'person@example.com' });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Email' })).toHaveValue('person@example.com');
  await dialog.getByLabel('Anything else').fill('A private answer');
  await dialog.getByRole('button', { name: 'Get early access', exact: true }).focus();
  await page.keyboard.press('Enter');
  const success = dialog.getByRole('heading', { name: 'Thank you for signing up.' });
  await expect(success).toBeFocused();
  await expect(success).toHaveCSS('outline-width', '3px');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await openPopup(page, 'topbar');
  await expect(dialog.getByRole('textbox', { name: 'Email' })).toHaveValue('');
  await expect(dialog.getByLabel('Anything else')).toHaveValue('');
  await expect(dialog.getByLabel('Role', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: 'Email' })).toBeFocused();
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  expect(await context.cookies()).toEqual([]);
  expect(writes).toEqual([]);
});

test('unset signup URL and GA ID in development simulate the dialog save without console errors', async ({ page }) => {
  test.setTimeout(45_000);
  const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', '4333', '--ignore-lock'], {
    cwd: process.cwd(),
    env: { ...process.env, PUBLIC_SIGNUP_URL: '', PUBLIC_GA_ID: '', PUBLIC_SIGNUP_PLAN: '', ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (data) => { output += String(data); });
  server.stderr.on('data', (data) => { output += String(data); });
  const errors: string[] = [];
  const warnings: string[] = [];
  const simulated: unknown[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
    if (message.type() === 'log' && message.text().startsWith('{"step":')) simulated.push(JSON.parse(message.text()));
  });
  // Fail safely if the supposedly unset development build attempts an external request.
  await page.route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), async (route) => {
    external.push(route.request().url());
    await route.abort();
  });
  try {
    await expect.poll(async () => {
      if (server.exitCode !== null) throw new Error(`Development server exited: ${output}`);
      try { return (await fetch('http://127.0.0.1:4333')).status; } catch { return 0; }
    }, { timeout: 20_000 }).toBe(200);
    await page.goto('http://127.0.0.1:4333/?src=dev-check');
    await page.waitForFunction(() => typeof window.gtag === 'function');
    expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0);
    await openPopup(page, 'hero', { email: 'dev@example.com' });
    await expect(page.getByRole('dialog')).toBeVisible();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Get early access', exact: true }).click();
    await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.getByRole('heading', { name: 'Thank you for signing up.' })).toBeVisible();
    expect(simulated).toEqual([
      { step: 2, email: 'dev@example.com', page: 'learner', src: 'dev-check', honeypot: '' },
    ]);
    expect(warnings.filter((message) => message.includes('PUBLIC_SIGNUP_URL is unset'))).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
    console.log(`Development simulation: one save, one unset-URL warning, zero console errors or external requests.`);
  } finally {
    await page.goto('about:blank');
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
  }
});
