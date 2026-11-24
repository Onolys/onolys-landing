import { expect, test } from '@playwright/test';
import { openPopup } from './open-popup';

for (const [route, pageId] of [['/', 'learner'], ['/enterprise', 'enterprise']] as const) {
  test(`${pageId} shell, popup signal, analytics queue and mobile layout`, async ({ page, context }) => {
    const errors: string[] = [];
    const persistenceWrites: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      const source = message.location().url;
      const blockedGa = /^https:\/\/(?:[^/]+\.)?googletagmanager\.com\//.test(source);
      if (message.type() === 'error' && !blockedGa) errors.push(message.text());
      if (message.text().startsWith('miti-persistence-write:')) persistenceWrites.push(message.text());
    });
    // Keep the test independent of GA availability and prevent third-party cookie writes.
    await page.route('**/*', async (request) => {
      const hostname = new URL(request.request().url()).hostname;
      if (hostname === 'googletagmanager.com' || hostname.endsWith('.googletagmanager.com')) {
        await request.abort();
      } else {
        await request.continue();
      }
    });
    await page.addInitScript(() => {
      for (const method of ['setItem', 'removeItem', 'clear'] as const) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, {
          configurable: true,
          value: function (...args: string[]) {
            console.debug(`miti-persistence-write:${method}`);
            return Reflect.apply(original, this, args);
          },
        });
      }
      const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
      Object.defineProperty(Document.prototype, 'cookie', {
        configurable: true,
        get: cookie.get,
        set(value: string) {
          console.debug('miti-persistence-write:cookie');
          cookie.set!.call(this, value);
        },
      });
    });

    await page.goto(`${route}?src=%20campaign%3Cscript%3E!%20`);
    await expect(page.locator('body')).toHaveAttribute('data-page', pageId);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#team article')).toHaveCount(3);
    const robots = page.locator('meta[name="robots"]');
    if (pageId === 'enterprise') {
      await expect(robots).toHaveAttribute('content', 'noindex, nofollow');
    } else {
      await expect(robots).toHaveCount(0);
    }

    // The existing client module's stub is the readiness signal for the dialog's event handler.
    await page.waitForFunction(() => typeof window.gtag === 'function');
    // Header CTAs are links to the app, not popup triggers.
    await expect(page.locator('header [data-open-popup]')).toHaveCount(0);
    await expect(page.locator('header a[data-trigger="topbar-signup"]')).toHaveText('Sign up');
    await expect(page.locator('header a[data-trigger="topbar-signup"]')).toHaveAttribute('href', /\/signup$/);
    await expect(page.locator('header a[data-trigger="topbar-login"]')).toHaveText('Log in');
    // The kept dialog still answers the popup event.
    await openPopup(page, 'smoke');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

    // No application-only test hooks: exercise the actual standard gtag queue.
    const queued = await page.evaluate(() => {
      const previousLength = window.dataLayer.length;
      window.gtag('event', 'foundation_smoke', { page: document.body.dataset.page });
      return Array.from(window.dataLayer[previousLength] as ArrayLike<unknown>);
    });
    expect(queued).toEqual(['event', 'foundation_smoke', { page: pageId }]);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(overflow.content).toBeLessThanOrEqual(overflow.viewport);
    expect(persistenceWrites).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(errors).toEqual([]);
  });
}
