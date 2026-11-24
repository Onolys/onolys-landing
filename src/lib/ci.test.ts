import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parseDocument } from 'yaml';

function workflow() {
  const parsed = parseDocument(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  expect(parsed.errors).toEqual([]);
  return parsed.toJS();
}

it('checks pushes and pull requests with a reproducible supported Node runtime', () => {
  const config = workflow();
  expect(Object.keys(config.on).sort()).toEqual(['pull_request', 'push']);
  expect(config.permissions).toEqual({ contents: 'read' });
  const steps = config.jobs.test.steps;
  expect(steps[0].uses).toBe('actions/checkout@v7');
  expect(steps.find((step: { uses?: string }) => step.uses === 'actions/setup-node@v7')?.with).toMatchObject({
    'node-version-file': '.nvmrc', cache: 'npm',
  });
});

it('cancels stale PR workflows before their tests finish while keeping push runs independent', () => {
  expect(workflow().concurrency).toEqual({
    group: 'ci-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}',
    'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
  });
});

it('runs validation before browser tests using public dummy configuration', () => {
  const job = workflow().jobs.test;
  expect(job.env).toMatchObject({
    PUBLIC_SIGNUP_URL: 'https://script.google.com/macros/s/TEST/exec',
    PUBLIC_GA_ID: 'G-TEST000000',
    PUBLIC_APP_URL: 'https://app.test',
  });
  const commands = job.steps.filter((step: { run?: string }) => step.run).map((step: { run: string }) => step.run);
  expect(commands).toEqual([
    'npm ci', 'npm run check', 'npm test', 'npm run build',
    'npx playwright install --with-deps chromium', 'npm run test:e2e',
  ]);
  expect(job.steps.find((step: { uses?: string }) => step.uses === 'actions/upload-artifact@v7')).toMatchObject({
    if: 'failure()', with: { path: 'playwright-report/' },
  });
});

it('deploys only after tests succeed on a push to main, using real repository variables', () => {
  const job = workflow().jobs.deploy;
  expect(job).toBeDefined();
  expect(job.needs).toBe('test');
  expect(job.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
  expect(job.env).toEqual({
    PUBLIC_SIGNUP_URL: '${{ vars.PUBLIC_SIGNUP_URL }}',
    PUBLIC_GA_ID: '${{ vars.PUBLIC_GA_ID }}',
    PUBLIC_SIGNUP_PLAN: '${{ vars.PUBLIC_SIGNUP_PLAN }}',
    PUBLIC_APP_URL: '${{ vars.PUBLIC_APP_URL }}',
  });
  const commands = job.steps.filter((step: { run?: string }) => step.run).map((step: { run: string }) => step.run);
  expect(commands[0]).toBe('npm ci');
  expect(commands[1]).toBe('npm run build:prod');
  const deploy = job.steps.find((step: { env?: { FIREBASE_SERVICE_ACCOUNT?: string } }) => step.env?.FIREBASE_SERVICE_ACCOUNT);
  expect(deploy.env.FIREBASE_SERVICE_ACCOUNT).toBe('${{ secrets.FIREBASE_SERVICE_ACCOUNT }}');
  expect(deploy.run).toContain('umask 077');
  expect(deploy.run).toContain('GOOGLE_APPLICATION_CREDENTIALS');
  expect(deploy.run).toContain('firebase deploy --only hosting --project onolys --non-interactive');
  expect(job.steps.at(-1)).toMatchObject({ if: 'always()' });
  expect(job.steps.at(-1).run).toContain('rm -f');
  expect(job.steps.at(-1).run).toContain('$RUNNER_TEMP');
  expect(job.steps.some((step: { uses?: string }) => step.uses?.includes('upload-artifact'))).toBe(false);
});

it('deploys previews only for tested same-repository pull requests with scoped permissions', () => {
  const config = workflow();
  const job = config.jobs.preview;
  expect(job).toBeDefined();
  expect(job.needs).toBe('test');
  expect(job.if).toBe("github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository");
  expect(job.permissions).toEqual({ contents: 'read', checks: 'write', 'pull-requests': 'write' });
  expect(job.concurrency).toEqual({
    group: 'hosting-preview-${{ github.event.number }}',
    'cancel-in-progress': true,
  });
  expect(job.env).toEqual(config.jobs.deploy.env);
  const commands = job.steps.filter((step: { run?: string }) => step.run).map((step: { run: string }) => step.run);
  expect(commands).toEqual(['npm ci', 'npm run build:prod']);
});

it('updates one expiring preview channel per PR and comments its URL without deploying live or redirects', () => {
  const job = workflow().jobs.preview;
  expect(job).toBeDefined();
  const deploy = job.steps.find((step: { uses?: string }) => step.uses?.startsWith('FirebaseExtended/action-hosting-deploy@'));
  expect(deploy?.uses).toBe('FirebaseExtended/action-hosting-deploy@500ac625ca2dd40cbd15f7659af953801858032a');
  expect(deploy.with).toEqual({
    repoToken: '${{ secrets.GITHUB_TOKEN }}',
    firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}',
    projectId: 'onolys',
    target: 'miti',
    channelId: 'pr-${{ github.event.number }}',
    expires: '7d',
    firebaseToolsVersion: '15.36.0',
  });
  expect(job.steps.some((step: { uses?: string }) => step.uses?.includes('upload-artifact'))).toBe(false);
});


it.each([0, 7])('removes scoped credentials after Firebase exits %s', (exitCode) => {
  const job = workflow().jobs.deploy;
  const deploy = job.steps.find((step: { env?: { FIREBASE_SERVICE_ACCOUNT?: string } }) => step.env?.FIREBASE_SERVICE_ACCOUNT);
  const dir = mkdtempSync(join(tmpdir(), 'miti-deploy-'));
  const mockNpx = join(dir, 'npx');
  try {
    writeFileSync(mockNpx, `#!/bin/sh
set -eu
test "$*" = "firebase deploy --only hosting --project onolys --non-interactive"
test "$GOOGLE_APPLICATION_CREDENTIALS" = "$RUNNER_TEMP/miti-firebase-service-account.json"
test -f "$GOOGLE_APPLICATION_CREDENTIALS"
test "$(stat -c '%a' "$GOOGLE_APPLICATION_CREDENTIALS")" = "600"
exit "$MOCK_DEPLOY_STATUS"
`);
    chmodSync(mockNpx, 0o700);
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', deploy.run], {
      env: {
        ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir,
        FIREBASE_SERVICE_ACCOUNT: '{"type":"service_account","private_key":"PUBLIC_TEST_FIXTURE"}',
        MOCK_DEPLOY_STATUS: String(exitCode),
      },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(exitCode);
    expect(existsSync(join(dir, 'miti-firebase-service-account.json'))).toBe(false);
    expect(result.stdout + result.stderr).not.toContain('PUBLIC_TEST_FIXTURE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
