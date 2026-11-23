import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import CtaButton from './CtaButton.astro';
import Section from './Section.astro';
import Analytics from './Analytics.astro';
import Footer from './Footer.astro';
import Learner from '../pages/index.astro';
import Enterprise from '../pages/enterprise.astro';

async function render(component: Parameters<AstroContainer['renderToString']>[0], props = {}, slots = {}) {
  const container = await AstroContainer.create();
  return new JSDOM(await container.renderToString(component, { props, slots })).window.document;
}

it('renders the shared CTA with the popup contract', async () => {
  const doc = await render(CtaButton, { trigger: 'hero' });
  const button = doc.querySelector('button')!;
  expect(button.type).toBe('button');
  expect(button.hasAttribute('data-open-popup')).toBe(true);
  expect(button.dataset.trigger).toBe('hero');
  expect(button.textContent).toBe('Get early access');
});

it('places a section CTA after its content and supports disabling it', async () => {
  const doc = await render(Section, { id: 'features', heading: 'Features' }, { default: '<p>Content</p>' });
  const section = doc.querySelector('section')!;
  expect(section.id).toBe('features');
  expect(section.querySelector('h2')?.textContent).toBe('Features');
  expect(section.querySelector('.container')).not.toBeNull();
  expect(section.querySelector('.container > .cta-row')?.lastElementChild?.getAttribute('data-trigger')).toBe('section:features');
  const noCta = await render(Section, { id: 'team', cta: false }, { default: '<p>Team</p>' });
  expect(noCta.querySelector('section')?.textContent).toContain('Team');
  expect(noCta.querySelector('[data-open-popup]')).toBeNull();
});

it('omits analytics scripts when no GA ID is provided', async () => {
  const doc = await render(Analytics);
  expect(doc.querySelector('script')).toBeNull();
});

it('loads GA asynchronously and configures the supplied ID', async () => {
  const doc = await render(Analytics, { gaId: 'G-TEST000000' });
  const external = doc.querySelector('script[src]')!;
  expect(external.getAttribute('src')).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST000000');
  expect(external.hasAttribute('async')).toBe(true);
  expect(doc.documentElement.textContent).toContain('G-TEST000000');
});

it.each([
  ['learner', 'Enterprise', '/enterprise'],
  ['enterprise', 'Individuals', '/'],
] as const)('renders the compact two-line footer (%s)', async (page, label, href) => {
  const doc = await render(Footer, { page });
  const footer = doc.querySelector('footer')!;
  expect(footer.querySelector('h3')).toBeNull();
  expect(footer.textContent).not.toContain('Note:');
  expect(footer.textContent).not.toContain('Questions?');
  expect(footer.textContent).not.toContain('All rights reserved');
  const lists = Array.from(footer.querySelectorAll('ul'));
  expect(lists).toHaveLength(2);
  expect(lists.every((ul) => ul.hasAttribute('data-inline-list'))).toBe(true);
  expect(footer.querySelectorAll('p')).toHaveLength(0);
  expect(Array.from(lists[0].querySelectorAll('li'), (li) => li.textContent?.trim())).toEqual([
    'Not official MITI coding',
    'Use it to practice and prepare',
    'Role-play or de-identified transcripts only',
  ]);
  const line2 = lists[1];
  expect(Array.from(line2.querySelectorAll('li'), (li) => li.textContent?.trim())).toEqual([
    'Privacy',
    'Terms',
    'Contact',
    label,
    '© 2026 Onolys',
  ]);
  expect(Array.from(line2.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
    'https://app.onolys.com/privacy',
    'https://app.onolys.com/terms',
    'mailto:tejitpabari99@gmail.com',
    href,
  ]);
  const sw = footer.querySelector('[data-footer-switch]')!;
  expect(sw.tagName).toBe('A');
  expect(sw.getAttribute('href')).toBe(href);
  expect(sw.textContent).toBe(label);
  expect(footer.querySelectorAll(`a[href="${href}"]`)).toHaveLength(1);
  expect(footer.querySelector('[style]')).toBeNull();
});

it('gives adjacent sections different tones on both pages', async () => {
  for (const component of [Learner, Enterprise]) {
    const doc = await render(component);
    const tones = Array.from(doc.querySelectorAll('main > section'), (s) => s.getAttribute('data-tone'));
    expect(tones.every(Boolean)).toBe(true);
    tones.slice(1).forEach((tone, i) => expect(tone, `${tones[i]} then ${tone}`).not.toBe(tones[i]));
  }
});

it.each([
  [Learner, '/', 'Enterprise', '/enterprise'],
  [Enterprise, '/enterprise', 'Individuals', '/'],
] as const)('renders header nav and secondary link (%#)', async (component, path, label, href) => {
  const doc = await render(component);
  const header = doc.querySelector('header')!;
  expect(header.querySelector('.brand')?.textContent).toBe('Onolys');
  expect(header.querySelector('.brand')?.getAttribute('href')).toBe('#top');
  expect(header.querySelector('img, svg')).toBeNull();
  expect(Array.from(header.querySelectorAll('nav a'), (a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['Features', '#features'], ['Evaluation', '#evaluates'], ['Comparison', '#compare'], ['Team', '#team'],
  ]);
  for (const a of header.querySelectorAll('nav a')) expect(doc.querySelector(a.getAttribute('href')!)).not.toBeNull();
  expect(header.querySelector('.secondary')?.textContent).toBe(label);
  expect(header.querySelector('.secondary')?.getAttribute('href')).toBe(href);
  expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null).toBe(path === '/' ? 'https://miti.onolys.com/' : null);
});

it.each([
  [Learner, 'https://miti.onolys.com/', 'Onolys — MITI evaluation with evidence for every score'],
  [Enterprise, 'https://miti.onolys.com/enterprise', 'Onolys for organizations'],
] as const)('renders full meta, icons and link-preview tags (%#)', async (component, url, title) => {
  const doc = await render(component);
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute('content');
  expect(doc.title).toBe(title);
  expect(meta('meta[name="theme-color"]')).toBe('#0b5f5a');
  expect(meta('meta[property="og:type"]')).toBe('website');
  expect(meta('meta[property="og:site_name"]')).toBe('Onolys');
  expect(meta('meta[property="og:title"]')).toBe(title);
  expect(meta('meta[property="og:description"]')).toBe(meta('meta[name="description"]'));
  expect(meta('meta[property="og:url"]')).toBe(url);
  expect(meta('meta[property="og:image"]')).toBe('https://miti.onolys.com/og.png');
  expect(meta('meta[property="og:image:width"]')).toBe('1200');
  expect(meta('meta[property="og:image:height"]')).toBe('630');
  expect(meta('meta[property="og:image:alt"]')).toBeTruthy();
  expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
  expect(meta('meta[name="twitter:title"]')).toBe(title);
  expect(meta('meta[name="twitter:image"]')).toBe('https://miti.onolys.com/og.png');
  expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg');
  expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/apple-touch-icon.png');
});

it('ships the icon and preview image files', () => {
  for (const file of ['favicon.svg', 'apple-touch-icon.png', 'og.png']) {
    expect(existsSync(new URL(`../../public/${file}`, import.meta.url)), file).toBe(true);
  }
});

it('uses one shared container and visually-hidden class instead of per-component copies', () => {
  const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.container\s*{[^}]*max-width:\s*72rem/);
  expect(css).toMatch(/\.visually-hidden\s*{/);
  for (const file of ['TopBar.astro', 'Footer.astro', 'Section.astro']) {
    expect(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'), file).not.toContain('72rem');
  }
  for (const file of ['../pages/index.astro', '../pages/enterprise.astro', './CompareTable.astro']) {
    expect(readFileSync(new URL(file, import.meta.url), 'utf8'), file).not.toMatch(/\.visually-hidden\s*{/);
  }
});

it.each([
  [Learner, 'learner', false],
  [Enterprise, 'enterprise', true],
] as const)('renders the page shell with correct indexing and navigation (%s)', async (component, page, noindex) => {
  const doc = await render(component);
  expect(doc.documentElement.lang).toBe('en');
  expect(doc.body.dataset.page).toBe(page);
  expect(doc.querySelector('main')).not.toBeNull();
  expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBeTruthy();
  expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null).toBe(noindex ? 'noindex, nofollow' : null);
  expect(doc.querySelector('header [data-open-popup]')?.getAttribute('data-trigger')).toBe('topbar');
  expect(doc.querySelector('footer')).not.toBeNull();
});
