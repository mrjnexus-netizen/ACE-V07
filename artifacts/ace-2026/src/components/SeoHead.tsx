// ============================================================
// SeoHead -- 2026-07-16 (per Reza)
//
// This is a client-side-rendered SPA (no server-side rendering), so
// this component only helps crawlers that actually execute JavaScript
// (Googlebot does). Link-preview bots (WhatsApp, Twitter/X, Facebook,
// LinkedIn, Slack) and any crawler that does NOT run JS never see
// anything this component does -- they only ever see the static tags
// baked into index.html. This is the honest, correct division of
// labor for a pure client-rendered app without a prerendering/SSR
// step: index.html carries the best possible single English default;
// this component keeps the in-browser tab title, meta description,
// <html lang>, and structured data accurate and per-locale for every
// visitor who is actually running the app, and for Googlebot.
//
// Title/description are admin-editable content (content_entries keys
// "seo.meta_title" / "seo.meta_description" / "seo.og_image"), reusing
// the SAME ContentContext + cascade-translation pipeline every other
// piece of site text already goes through -- no new backend needed for
// this half of the feature.
// ============================================================
import { useEffect } from 'react';

import { useContent } from '../context/ContentContext';
import { useIdentity } from '../context/IdentityContext';
import type { Locale } from '../types';

export const SEO_DEFAULT_TITLE = 'Amir Moslehi — Cinematic Composer for Film, Games & Animation';
export const SEO_DEFAULT_DESCRIPTION =
  'Amir Moslehi is a cinematic composer scoring original music for film, games, and animation. Explore selected works, listen to the score, and get in touch about a project.';
const SITE_URL = 'https://www.amirmoslehi.com';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export default function SeoHead() {
  const { locale } = useIdentity();
  const { resolve } = useContent();

  useEffect(() => {
    const activeLocale: Locale = locale ?? ('en' as Locale);

    const title = resolve('seo.meta_title', activeLocale) ?? SEO_DEFAULT_TITLE;
    const description = resolve('seo.meta_description', activeLocale) ?? SEO_DEFAULT_DESCRIPTION;
    const ogImage = resolve('seo.og_image', 'en' as Locale) ?? `${SITE_URL}/og-image.jpg`;
    // Same content key Footer.tsx already reads for the visible signature
    // -- reused here rather than guessing at a field on ComposerIdentity.
    const composerName = resolve('identity.name', 'en' as Locale) ?? 'Amir Moslehi';

    document.title = title;
    document.documentElement.lang = activeLocale;

    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:url', window.location.href);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', ogImage);

    upsertLink('canonical', window.location.href);

    upsertJsonLd('seo-person-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: composerName,
      jobTitle: 'Composer',
      url: SITE_URL,
      description,
    });
  }, [locale, resolve]);

  return null;
}
