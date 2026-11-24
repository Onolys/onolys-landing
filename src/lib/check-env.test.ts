import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { validateEnv } from '../../scripts/check-env.mjs';

const valid = {
  PUBLIC_SIGNUP_URL: 'https://script.google.com/macros/s/TEST/exec',
  PUBLIC_GA_ID: 'G-TEST000000',
};

it('accepts the CI configuration and ignores the optional plan', () => {
  expect(() => validateEnv(valid)).not.toThrow();
  expect(() => validateEnv({ ...valid, PUBLIC_SIGNUP_PLAN: '' })).not.toThrow();
});

it.each([
  undefined,
  '',
  'not-a-url',
  'http://script.google.com/macros/s/TEST/exec',
  'https://script.google.com.evil.example/exec',
  'https://script.google.com@evil.example/exec',
  'https://user:password@script.google.com/exec',
  'https://script.google.com:444/exec',
])('rejects missing/malformed signup URL: %s', (value) => {
  expect(() => validateEnv({ ...valid, PUBLIC_SIGNUP_URL: value })).toThrow('PUBLIC_SIGNUP_URL');
});

it.each([undefined, '', 'https://app.onolys.com', 'https://app.test:8443'])('accepts unset/empty/valid app URL: %s', (value) => {
  expect(() => validateEnv({ ...valid, PUBLIC_APP_URL: value })).not.toThrow();
});

it.each([
  'http://app.onolys.com',
  'https://app.onolys.com/login',
  'https://app.onolys.com/?x=1',
  'garbage',
  'https://user:pw@app.onolys.com',
])('rejects malformed app URL: %s', (value) => {
  expect(() => validateEnv({ ...valid, PUBLIC_APP_URL: value })).toThrow('PUBLIC_APP_URL');
});

it.each([undefined, '', 'G-', 'UA-12345', 'G-test', 'G-TEST/123'])('rejects missing/malformed GA ID: %s', (value) => {
  expect(() => validateEnv({ ...valid, PUBLIC_GA_ID: value })).toThrow('PUBLIC_GA_ID');
});

it('loads production dotenv files while preserving process environment priority', () => {
  const dir = mkdtempSync(join(tmpdir(), 'miti-env-'));
  const script = fileURLToPath(new URL('../../scripts/check-env.mjs', import.meta.url));
  const env = { ...process.env };
  delete env.PUBLIC_SIGNUP_URL;
  delete env.PUBLIC_GA_ID;
  try {
    writeFileSync(join(dir, '.env'), 'PUBLIC_SIGNUP_URL=invalid\nPUBLIC_GA_ID=invalid\n');
    writeFileSync(join(dir, '.env.local'), `PUBLIC_SIGNUP_URL=${valid.PUBLIC_SIGNUP_URL}\n`);
    writeFileSync(join(dir, '.env.production'), `PUBLIC_GA_ID=${valid.PUBLIC_GA_ID}\n`);
    const dotenv = spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' });
    expect(dotenv.status, dotenv.stderr).toBe(0);
    const overridden = spawnSync(process.execPath, [script], {
      cwd: dir, env: { ...env, PUBLIC_GA_ID: 'invalid' }, encoding: 'utf8',
    });
    expect(overridden.status).toBe(1);
    expect(overridden.stderr).toContain('PUBLIC_GA_ID');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
