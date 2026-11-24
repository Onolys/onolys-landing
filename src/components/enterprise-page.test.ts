import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import Enterprise from '../pages/enterprise.astro';
import { appUrl } from '../lib/app-url';

async function render() {
  const container = await AstroContainer.create();
  return new JSDOM(await container.renderToString(Enterprise)).window.document;
}

describe('enterprise landing page', () => {
  it('assembles six sections with one exact hero headline and no hero disclaimer', async () => {
    const doc = await render();
    const main = doc.querySelector('main')!;
    expect(Array.from(main.querySelectorAll(':scope > section')).map(({ id }) => id)).toEqual(['hero', 'benefits', 'features', 'evaluates', 'compare', 'team']);
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('h1')?.textContent).toBe('Quality-check your MITI coding. Every score, backed by the session.');
    expect(doc.querySelector('#hero')?.textContent).toContain("We read each coded sample against its transcript and flag the scores the session doesn't support, with line references.");
    expect(doc.querySelector('#hero')?.textContent).not.toMatch(/not official MITI coding/i);
    expect(doc.querySelector('.hero-limits')).toBeNull();
    const hero = doc.querySelectorAll('#hero a[data-trigger="hero"]');
    expect(hero).toHaveLength(1);
    expect(hero[0].textContent?.trim()).toBe('Try it out');
    expect(hero[0].getAttribute('href')).toBe(appUrl('/signup'));
    expect(doc.querySelector('[data-open-popup]')).toBeNull();
    expect(doc.querySelector('[data-hero-signup]')).toBeNull();
    expect(main.lastElementChild?.id).toBe('team');
    expect(main.nextElementSibling?.tagName).toBe('FOOTER');
  });

  it('composes the enterprise feature tabs, comparison, and section CTAs', async () => {
    const doc = await render();
    for (const id of ['benefits', 'features', 'evaluates', 'compare']) {
      expect(doc.querySelectorAll(`#${id} [data-app-link]`)).toHaveLength(1);
      const cta = doc.querySelector(`#${id} .cta-row > a[data-app-link]`)!;
      expect(cta.textContent?.trim()).toBe('Try it out');
      expect(cta.getAttribute('href')).toBe(appUrl('/signup'));
      expect(cta.getAttribute('data-trigger')).toBe(`section:${id}`);
    }
    expect(doc.querySelector('#benefits')?.querySelectorAll('article')).toHaveLength(3);
    const heading = doc.querySelector('#features h2')!;
    expect(heading.textContent).toBe('Features');
    expect(heading.classList.contains('visually-hidden')).toBe(true);
    const tabs = Array.from(doc.querySelectorAll('#features [role="tab"]'));
    expect(tabs.map((tab) => tab.querySelector('.h')?.textContent)).toEqual(['See the full MITI score', "Flag scores the session doesn't support", 'Show coders where they drift']);
    expect(tabs.map((tab) => tab.id)).toEqual(['ent-features-tab-0', 'ent-features-tab-1', 'ent-features-tab-2']);
    expect(doc.querySelectorAll('#ent-features-panel-1 [data-qc-row]')).toHaveLength(3);
    expect(doc.querySelectorAll('#ent-features-panel-0 [data-rating]')).toHaveLength(4);
    expect(doc.querySelectorAll('#ent-features-panel-2 [data-suggestion]')).toHaveLength(3);
    expect(doc.querySelector('#evaluates')?.querySelectorAll('article')).toHaveLength(6);
    expect(doc.querySelector('#compare h2')?.textContent).toBe('How it compares');
    expect(Array.from(doc.querySelectorAll('#compare thead th')).map((header) => header.textContent?.trim())).toEqual(['Criterion', 'Second human coder', 'Onolys evidence check']);
  });

  it('keeps enterprise main copy within the approved limits', async () => {
    const doc = await render();
    const main = doc.querySelector('main')!;
    expect(main.textContent).not.toMatch(/\$|accura|replace/i);
    expect(main.textContent).not.toContain('Results in minutes, not the 1 to 2 weeks human coding takes.');
    expect(doc.body.dataset.page).toBe('enterprise');
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });
});
