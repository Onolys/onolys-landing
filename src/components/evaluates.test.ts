import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { evaluates } from '../data/evaluates';
import EvaluatesSection from './EvaluatesSection.astro';
import { appUrl } from '../lib/app-url';

const expectedCards = [
  { headline: 'Full MITI 4.2.1', line: '4 global ratings (1 to 5) and 10 behavior codes, not just counts.' },
  { headline: 'Traceable', line: 'every code and rating links to its transcript lines.' },
  { headline: 'Benchmarked', line: 'Summary scores checked against MITI fair/good levels.' },
  { headline: 'Change-goal aware', line: 'scored against the target behavior you name, as MITI requires.' },
  { headline: 'Your own session', line: 'your real transcript, not a chat with a simulated client.' },
  { headline: 'Minutes, not weeks', line: 'Feedback while the session is still fresh.' },
];

describe('evaluation feature cards', () => {
  it('keeps all six approved headline and description pairs exact', () => {
    expect(evaluates).toEqual(expectedCards);
  });

  it('renders a reusable, labeled section with six cards and a trailing early-access CTA', async () => {
    const container = await AstroContainer.create();
    const doc = new JSDOM(await container.renderToString(EvaluatesSection)).window.document;
    const section = doc.querySelector('section#evaluates')!;
    expect(section.querySelector('h2')?.textContent).toBe('What it evaluates');
    expect(section.getAttribute('aria-labelledby')).toBe(section.querySelector('h2')?.id);
    const cards = Array.from(section.querySelectorAll('article'));
    expect(cards).toHaveLength(6);
    cards.forEach((card, index) => {
      expect(card.querySelector('h3')?.textContent).toBe(expectedCards[index].headline);
      expect(card.querySelector('p')?.textContent).toBe(expectedCards[index].line);
    });
    expect(doc.querySelector('.evaluation-cards')).not.toBeNull();
    expect(section.querySelectorAll('[data-app-link]')).toHaveLength(1);
    const cta = section.querySelector('a[data-app-link]')!;
    expect(cta.textContent?.trim()).toBe('Try it out');
    expect(cta.getAttribute('href')).toBe(appUrl('/signup'));
    expect(section.querySelector('[data-open-popup]')).toBeNull();
    expect(cta.getAttribute('data-trigger')).toBe('section:evaluates');
    expect(section.querySelector('.container')?.lastElementChild?.lastElementChild).toBe(cta);
  });
});
