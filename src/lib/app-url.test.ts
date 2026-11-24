import { afterEach, expect, it, vi } from 'vitest';
import { appUrl } from './app-url';

afterEach(() => vi.unstubAllEnvs());

it('defaults to the production app origin', () => {
  vi.stubEnv('PUBLIC_APP_URL', '');
  expect(appUrl('/login')).toBe('https://app.onolys.com/login');
});

it('uses PUBLIC_APP_URL when set', () => {
  vi.stubEnv('PUBLIC_APP_URL', 'https://app.test');
  expect(appUrl('/signup')).toBe('https://app.test/signup');
});

it('trims trailing slashes from the origin', () => {
  vi.stubEnv('PUBLIC_APP_URL', 'https://app.test/');
  expect(appUrl('/login')).toBe('https://app.test/login');
  expect(appUrl()).toBe('https://app.test');
});

it('joins paths with or without a leading slash', () => {
  vi.stubEnv('PUBLIC_APP_URL', 'https://app.test');
  expect(appUrl('login')).toBe('https://app.test/login');
  expect(appUrl('/a/b?x=1')).toBe('https://app.test/a/b?x=1');
});
