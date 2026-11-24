import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TopBar from './TopBar.astro';
import Learner from '../pages/index.astro';
import Enterprise from '../pages/enterprise.astro';
import { appUrl } from '../lib/app-url';

afterEach(() => vi.unstubAllEnvs());

async function render(component: Parameters<AstroContainer['renderToString']>[0], props = {}) {
  const container = await AstroContainer.create();
  return new JSDOM(await container.renderToString(component, { props })).window.document;
}

describe.each([
  ['/', Learner],
  ['/enterprise', Enterprise],
] as const)('top bar auth links on %s', (_path, page) => {
  it('renders Log in then Sign up after the secondary link, as plain same-tab app links', async () => {
    const doc = await render(page);
    const header = doc.querySelector('header')!;
    const login = header.querySelector('.auth a[data-trigger="topbar-login"]')!;
    const signup = header.querySelector('.auth a[data-trigger="topbar-signup"]')!;
    expect(login.textContent?.trim()).toBe('Log in');
    expect(login.getAttribute('href')).toBe(appUrl('/login'));
    expect(signup.textContent?.trim()).toBe('Sign up');
    expect(signup.getAttribute('href')).toBe(appUrl('/signup'));
    for (const a of [login, signup]) {
      expect(a.hasAttribute('data-app-link')).toBe(true);
      expect(a.hasAttribute('target')).toBe(false);
      expect(a.getAttribute('href')).not.toContain('?');
    }
    expect(login.nextElementSibling).toBe(signup);
    expect(header.querySelector('.secondary')!.nextElementSibling).toBe(header.querySelector('.auth'));
    expect(signup.classList.contains('signup')).toBe(true);
  });

  it('has no early-access popup trigger in the header', async () => {
    const doc = await render(page);
    expect(doc.querySelector('header [data-open-popup]')).toBeNull();
  });
});

it('puts Log in in the side panel after a separator', async () => {
  const doc = await render(TopBar, { page: 'enterprise' });
  const login = doc.querySelector('#mobile-nav a.panel-login')!;
  expect(login.textContent?.trim()).toBe('Log in');
  expect(login.getAttribute('href')).toBe(appUrl('/login'));
  expect(login.previousElementSibling?.classList.contains('panel-sep')).toBe(true);
  expect(doc.querySelector('#mobile-nav [data-open-popup]')).toBeNull();
});

it('uses the PUBLIC_APP_URL override through appUrl', async () => {
  vi.stubEnv('PUBLIC_APP_URL', 'https://app.test');
  const doc = await render(TopBar, { page: 'learner' });
  expect(doc.querySelector('header [data-trigger="topbar-login"]')?.getAttribute('href')).toBe('https://app.test/login');
  expect(doc.querySelector('header [data-trigger="topbar-signup"]')?.getAttribute('href')).toBe('https://app.test/signup');
});

describe.each([
  ['/', Learner],
  ['/enterprise', Enterprise],
] as const)('PUBLIC_APP_URL override on %s', (_path, page) => {
  it('changes every app href (top bar, side panel, Try it out)', async () => {
    vi.stubEnv('PUBLIC_APP_URL', '');
    const before = await render(page);
    const defaults = [...before.querySelectorAll('a[data-app-link]')].map((a) => a.getAttribute('href')!);
    expect(defaults.length).toBeGreaterThanOrEqual(4);
    expect(defaults.every((h) => h.startsWith('https://app.onolys.com/'))).toBe(true);

    vi.stubEnv('PUBLIC_APP_URL', 'https://app.test/');
    const after = await render(page);
    const links = [...after.querySelectorAll('a[data-app-link]')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      defaults.map((h) => h.replace('https://app.onolys.com', 'https://app.test')),
    );
    expect(after.documentElement.innerHTML).not.toContain('app.onolys.com');
  });
});
