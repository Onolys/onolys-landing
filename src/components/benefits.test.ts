import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { benefits } from '../data/benefits';
import BenefitsSection from './BenefitsSection.astro';
import { appUrl } from '../lib/app-url';

const expectedCards = [
  { headline: 'Bulk evaluations', line: 'Volume pricing for evaluating many samples across your team or program.' },
  { headline: 'Quality control', line: 'Check each coded sample against its transcript. Unsupported scores are flagged with lines, which also shows new coders where they drift.' },
  { headline: 'Fast turnaround', line: 'Flags arrive in minutes, so second coding focuses only on disputed scores.' },
];

describe('enterprise benefits', () => {
  it('preserves the three approved headline and description pairs', () => {
    expect(benefits).toEqual(expectedCards);
  });

  it('renders three cards and one trailing benefits CTA in a labeled section', async () => {
    const container = await AstroContainer.create();
    const doc = new JSDOM(await container.renderToString(BenefitsSection)).window.document;
    const section = doc.querySelector('section#benefits')!;
    expect(section.getAttribute('aria-labelledby')).toBe(section.querySelector('h2')?.id);
    const cards = Array.from(section.querySelectorAll('article'));
    expect(cards).toHaveLength(3);
    cards.forEach((card, index) => {
      expect(card.querySelector('h3')?.textContent).toBe(expectedCards[index].headline);
      expect(card.querySelector('p')?.textContent).toBe(expectedCards[index].line);
    });
    expect(section.querySelectorAll('[data-app-link]')).toHaveLength(1);
    const cta = section.querySelector('a[data-app-link]')!;
    expect(cta.textContent?.trim()).toBe('Try it out');
    expect(cta.getAttribute('href')).toBe(appUrl('/signup'));
    expect(section.querySelector('[data-open-popup]')).toBeNull();
    expect(cta.getAttribute('data-trigger')).toBe('section:benefits');
    expect(section.querySelector('.container')?.lastElementChild?.lastElementChild).toBe(cta);
    expect(section.textContent).not.toMatch(/\$|accura|replace/i);
  });
});
