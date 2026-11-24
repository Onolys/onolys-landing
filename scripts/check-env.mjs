import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

/** @param {Record<string, string | undefined>} env */
export function validateEnv(env) {
  const errors = [];
  try {
    const url = new URL(env.PUBLIC_SIGNUP_URL ?? '');
    if (url.protocol !== 'https:' || url.host !== 'script.google.com' || url.username || url.password) {
      throw new Error('Invalid endpoint');
    }
  } catch {
    errors.push('PUBLIC_SIGNUP_URL must be an HTTPS URL on script.google.com without credentials.');
  }
  if (!/^G-[A-Z0-9]+$/.test(env.PUBLIC_GA_ID ?? '')) {
    errors.push('PUBLIC_GA_ID must be a GA4 measurement ID beginning with G-.');
  }
  if (env.PUBLIC_APP_URL) {
    try {
      const url = new URL(env.PUBLIC_APP_URL);
      const bare = url.pathname === '/' && !url.search && !url.hash && !env.PUBLIC_APP_URL.endsWith('?') && !env.PUBLIC_APP_URL.endsWith('#');
      if (url.protocol !== 'https:' || url.username || url.password || !bare) throw new Error('Invalid origin');
    } catch {
      errors.push('PUBLIC_APP_URL must be an HTTPS origin without a path (or empty to use the default).');
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // Match Astro's default production build dotenv files and process-env priority.
    validateEnv(loadEnv('production', process.cwd(), 'PUBLIC_'));
    console.log('Production environment validated.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Environment validation failed.');
    process.exitCode = 1;
  }
}
