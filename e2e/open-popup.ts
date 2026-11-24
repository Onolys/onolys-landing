import type { Locator, Page } from '@playwright/test';

/**
 * The page CTAs are now plain links to the app, so nothing on the page opens the
 * signup dialog. The dialog code is kept, and its only entry point is the
 * `miti:open-popup` document event, so tests open it the same way the old CTAs did.
 * Focusing `from` first makes it the invoker the dialog restores focus to on close.
 */
export async function openPopup(page: Page, trigger: string, options: { email?: string; from?: Locator } = {}) {
  await page.waitForFunction(() => typeof window.gtag === 'function');
  await options.from?.focus();
  await page.evaluate(({ trigger: name, email }) => {
    document.dispatchEvent(new CustomEvent('miti:open-popup', { detail: { trigger: name, email } }));
  }, { trigger, email: options.email ?? '' });
}
