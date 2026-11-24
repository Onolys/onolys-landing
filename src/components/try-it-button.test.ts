import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import TryItButton from './TryItButton.astro';
import { appUrl } from '../lib/app-url';

it('renders a same-tab sign-up link with the trigger and no popup hook', async () => {
  const container = await AstroContainer.create();
  const doc = new JSDOM(await container.renderToString(TryItButton, { props: { trigger: 'hero' } })).window.document;
  const links = doc.querySelectorAll('a');
  expect(links).toHaveLength(1);
  const a = links[0];
  expect(a.textContent?.trim()).toBe('Try it out');
  expect(a.getAttribute('href')).toBe(appUrl('/signup'));
  expect(a.hasAttribute('data-app-link')).toBe(true);
  expect(a.getAttribute('data-trigger')).toBe('hero');
  expect(a.hasAttribute('data-open-popup')).toBe(false);
  expect(a.hasAttribute('target')).toBe(false);
  expect(doc.querySelector('button')).toBeNull();
});
