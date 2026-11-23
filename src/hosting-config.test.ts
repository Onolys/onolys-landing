import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const raw = readFileSync(new URL('../firebase.json', import.meta.url), 'utf8');
const config = JSON.parse(raw);
const target = (name: string) => config.hosting.find((h: { target: string }) => h.target === name);

it('firebase.json is valid JSON', () => {
  expect(config.hosting).toBeInstanceOf(Array);
});

it('miti target 301-redirects /sample (and trailing slash) to the app sample report', () => {
  expect(target('miti').redirects).toEqual([
    { source: '/sample{,/}', destination: 'https://app.onolys.com/sample', type: 301 },
  ]);
});

it('redirect target is unchanged', () => {
  expect(target('redirect').redirects).toEqual([
    { source: '**', destination: 'https://miti.onolys.com', type: 301 },
  ]);
  expect(target('redirect').public).toBe('redirect');
});
