import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import HeroForm from './HeroForm.astro';
import Learner from '../pages/index.astro';
import Enterprise from '../pages/enterprise.astro';

it.each([
  [{}, 'hero-signup', 'Get early access'],
  [{ id: 'custom-form', label: 'Join the list' }, 'custom-form', 'Join the list'],
] as const)('renders labelled email capture and an unreachable honeypot (%j)', async (props, id, label) => {
  const container = await AstroContainer.create();
  const document = new JSDOM(await container.renderToString(HeroForm, { props })).window.document;
  const form = document.querySelector('form')!;
  expect(form.id).toBe(id);
  expect(form.hasAttribute('novalidate')).toBe(true);
  // Without JS a native submit must never put the email into the URL.
  expect(form.getAttribute('method')).toBe('post');
  expect(form.getAttribute('action')).toBe('#');
  expect(form.hasAttribute('data-hero-signup')).toBe(true);
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  expect(email.type).toBe('email');
  expect(email.required).toBe(true);
  expect(email.autocomplete).toBe('email');
  expect(email.inputMode).toBe('email');
  expect(email.getAttribute('aria-invalid')).toBe('false');
  expect(form.querySelector(`label[for="${email.id}"]`)?.textContent).toBe('Email');
  expect(form.querySelector(`label[for="${email.id}"]`)?.classList.contains('signup-visually-hidden')).toBe(true);
  const error = document.getElementById(email.getAttribute('aria-describedby')!)!;
  expect(error.hasAttribute('data-email-error')).toBe(true);
  expect(error.getAttribute('aria-live')).toBe('polite');
  expect(form.querySelector('button')?.textContent).toBe(label);
  const honeypot = form.querySelector<HTMLInputElement>('[name="company_website"]')!;
  expect(honeypot.type).toBe('text');
  expect(honeypot.tabIndex).toBe(-1);
  expect(honeypot.autocomplete).toBe('off');
  expect(honeypot.closest('[aria-hidden="true"][inert]')?.classList.contains('signup-honeypot')).toBe(true);
  expect(form.querySelector(`label[for="${honeypot.id}"]`)).toBeNull();
});

it.each([Learner, Enterprise])('no longer mounts the hero form in either shell (replaced by Try it out)', async (component) => {
  const container = await AstroContainer.create();
  const document = new JSDOM(await container.renderToString(component)).window.document;
  expect(document.querySelector('main [data-hero-signup]')).toBeNull();
  expect(document.querySelectorAll('#hero a[data-app-link][data-trigger="hero"]')).toHaveLength(1);
});
