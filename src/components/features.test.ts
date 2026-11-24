import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import Learner from '../pages/index.astro';
import Enterprise from '../pages/enterprise.astro';
import { appUrl } from '../lib/app-url';

async function features(page: typeof Learner) {
  const container = await AstroContainer.create();
  const doc = new JSDOM(await container.renderToString(page)).window.document;
  return doc.querySelector('#features')!;
}

function assertWidget(root: Element, headings: string[], lines: string[]) {
  const widget = root.querySelector('[data-tabs]')!;
  expect(widget.getAttribute('data-orientation')).toBe('vertical');
  const tabs = Array.from(widget.querySelectorAll('[role="tab"]'));
  expect(tabs.map((tab) => tab.querySelector('.h')?.textContent)).toEqual(headings);
  expect(tabs.map((tab) => tab.querySelector('.d')?.textContent)).toEqual(lines);
  expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  const panels = Array.from(widget.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  expect(panels).toHaveLength(3);
  expect(panels.map((panel) => panel.hidden)).toEqual([false, true, true]);
  expect(panels.map((panel) => panel.hasAttribute('inert'))).toEqual([false, true, true]);
  tabs.forEach((tab, i) => {
    expect(tab.getAttribute('aria-controls')).toBe(panels[i].id);
    expect(panels[i].getAttribute('aria-labelledby')).toBe(tab.id);
  });
  expect(widget.querySelector('.win-bar')?.textContent?.trim()).toBe('Onolys · Session report');
  // Static windows: no scroll containers, no transcript pane.
  expect(widget.querySelector('[data-transcript-pane], [data-highlight-root]')).toBeNull();
  expect(widget.outerHTML).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
  return panels;
}

function assertScorePanel(panel: Element) {
  const ratings = Array.from(panel.querySelectorAll('[data-rating]')).map((r) => [r.querySelector('span')?.textContent, r.querySelector('b')?.textContent]);
  expect(ratings).toEqual([['Cultivating change talk', '3.0/5'], ['Softening sustain talk', '3.5/5'], ['Partnership', '4.0/5'], ['Empathy', '4.0/5']]);
  const chips = Array.from(panel.querySelectorAll('[data-chip]')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
  expect(chips).toEqual(['% complex reflections42% Fair', 'Reflection-to-question1.2 Good', 'Technical3.3', 'Relational4.0']);
}

describe('learner features widget', () => {
  it('has the three approved tabs, window frame and static panels', async () => {
    const root = await features(Learner);
    const panels = assertWidget(root, ['See your full MITI score', 'Know why each score was given', 'Learn what to improve next'], [
      "Global ratings, behavior counts and summary scores, like a human coder's report.",
      'Every rating links to the exact transcript lines behind it.',
      'Concrete suggestions for your next session.',
    ]);
    assertScorePanel(panels[0]);
    expect(Array.from(panels[1].querySelectorAll('[data-score-pill]')).map((p) => p.textContent)).toEqual(['Empathy4/5', 'Partnership4/5', 'Change talk3/5']);
    expect(Array.from(panels[1].querySelectorAll('[data-quote]')).map((q) => q.querySelector('code')?.textContent)).toEqual(['L12', 'L27', 'L18', 'L41']);
    expect(panels[1].querySelectorAll('svg path')).toHaveLength(4);
    expect(panels[1].querySelector('.ev-cap')?.textContent).toBe('Every score points to the lines behind it.');
    expect(Array.from(panels[2].querySelectorAll('[data-suggestion] b')).map((b) => b.textContent)).toEqual([
      'Try a complex reflection after L18', 'Ask fewer closed questions', 'Affirm effort when they share a step',
    ]);
    expect(root.textContent).toContain('Results in minutes, not the 1 to 2 weeks human coding takes.');
    expect(root.querySelectorAll('.cta-row > a[data-app-link]')).toHaveLength(1);
    expect(root.querySelector('.cta-row > a[data-app-link]')?.textContent?.trim()).toBe('Try it out');
    expect(root.querySelector('.cta-row > a[data-app-link]')?.getAttribute('href')).toBe(appUrl('/signup'));
    expect(root.querySelector('[data-open-popup]')).toBeNull();
  });
});

describe('enterprise features widget', () => {
  it('has the enterprise tabs and static panels', async () => {
    const root = await features(Enterprise);
    const panels = assertWidget(root, ['See the full MITI score', "Flag scores the session doesn't support", 'Show coders where they drift'], [
      'Global ratings, behavior counts and summary scores for every sample.',
      'Each coded score is checked against the transcript, with line references.',
      'Patterns across samples help new coders calibrate.',
    ]);
    assertScorePanel(panels[0]);
    const rows = Array.from(panels[1].querySelectorAll('[data-qc-row]'));
    expect(rows.map((r) => r.querySelector('.tag')?.textContent)).toEqual(['Unsupported', 'Supported', 'Supported']);
    expect(rows[0].querySelector('.tag')?.classList.contains('low')).toBe(true);
    expect(rows[0].textContent).toContain('L12, L27');
    expect(Array.from(panels[2].querySelectorAll('[data-suggestion]'))).toHaveLength(3);
    expect(panels[2].textContent).toContain('Empathy rated high without complex reflections');
    expect(root.textContent).not.toContain('Results in minutes, not the 1 to 2 weeks human coding takes.');
  });
});
