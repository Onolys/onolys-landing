const DEFAULT_APP_URL = 'https://app.onolys.com';

/** Single source of the app origin. Build-time `PUBLIC_APP_URL`, empty means default. */
export function appUrl(path = ''): string {
  const origin = (import.meta.env.PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');
  if (!path) return origin;
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}
