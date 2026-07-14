// ============================================================
// Curated font catalog for the per-text font picker (2026-07-13, per
// Reza's second curation pass). Every entry is a REAL Google Fonts
// family, verified against Google Fonts' actual catalog before being
// added here — not just trusted from a pasted list. A handful of
// fonts from Reza's original pasted list turned out to be
// Adobe-Fonts-only or otherwise not distributed via Google's CDN
// (Source Han Sans/Serif, Alibaba PuHuiTi, DingTalk JinBuTi, Douyu
// Font — all Adobe/proprietary only; "Fredoka One" was removed from
// Google Fonts in 2021, superseded by the variable "Fredoka" family)
// — those were swapped for real equivalents rather than kept as
// silently-broken entries that would fall back to a generic font
// (exactly the "everything looks the same" bug this whole feature
// exists to avoid). English/Spanish/French are now THREE INDEPENDENT
// 20-font lists (previously shared one Latin list) — Reza's explicit
// request this round. Chinese Simplified stays at its real, honest
// count (~9) rather than padded to 20 — same finding as the original
// curation pass, confirmed again on recheck.
// ============================================================

export interface FontOption {
  /** Exact Google Fonts family name — used both for the CSS @import/link
   * AND as the font-family value, so these two can never drift apart. */
  family: string;
  /** A short vibe/character tag (e.g. "Luxury and Classic") — shown
   * next to the font name AND rendered IN that font as the live
   * preview (2026-07-13 v2, per Reza — replaces the old fixed sample
   * sentence; the tag itself IS the preview text now). */
  note: string;
}

export const ENGLISH_FONTS: FontOption[] = [
  { family: 'Playfair Display', note: 'Luxury and Classic' },
  { family: 'Montserrat', note: 'Minimal and Technical' },
  { family: 'Cinzel', note: 'Formal and Cinematic' },
  { family: 'Abril Fatface', note: 'Chic and Fashionable' },
  { family: 'Space Mono', note: 'Quirky and Sci-Fi/Tech' },
  { family: 'Bebas Neue', note: 'Poster and Bold' },
  { family: 'Pacifico', note: 'Casual and Artistic' },
  { family: 'Righteous', note: 'Retro and Art Deco' },
  { family: 'UnifrakturMaguntia', note: 'Gothic and Dark' },
  { family: 'Dancing Script', note: 'Handwritten and Elegant' },
  { family: 'Syne', note: 'Avant-Garde and Highly Unique' },
  { family: 'Cormorant Garamond', note: 'Very Formal and Historical' },
  { family: 'Anton', note: 'Powerful and Industrial' },
  { family: 'Josefin Sans', note: 'Chic, Thin, and Geometric' },
  { family: 'Permanent Marker', note: 'Street and Grunge' },
  { family: 'Amatic SC', note: 'Indie and Hand-Drawn' },
  { family: 'Zilla Slab', note: 'Modern and Corporate' },
  { family: 'Lobster', note: 'Fantasy and Energetic' },
  // 'Fredoka One' removed from Google Fonts in 2021 — superseded by
  // the variable 'Fredoka' family. Same look at weight 700.
  { family: 'Fredoka', note: 'Cute and Chunky' },
  { family: 'Oswald', note: 'Functional and Condensed' },
];

export const SPANISH_FONTS: FontOption[] = [
  { family: 'Vidaloka', note: 'Luxury and Aristocratic' },
  { family: 'Lato', note: 'Minimal and Clean' },
  { family: 'Merriweather', note: 'Formal and Editorial' },
  { family: 'Creepster', note: 'Quirky and Creepy' },
  { family: 'Sacramento', note: 'Very Chic and Delicate' },
  { family: 'Alfa Slab One', note: 'Heavy and Display' },
  { family: 'Caveat', note: 'Friendly and Handwritten' },
  { family: 'Bungee', note: 'Urban and Blocky' },
  { family: 'Prata', note: 'Classic and Sophisticated' },
  { family: 'Titan One', note: 'Pop and Energetic' },
  { family: 'EB Garamond', note: 'Academic and Formal' },
  { family: 'Satisfy', note: 'Artistic and Fluid' },
  { family: 'Poppins', note: 'Geometric and Modern' },
  { family: 'Chicle', note: 'Cartoonish and Fun' },
  { family: 'Lora', note: 'Poetic and Soft' },
  { family: 'Rubik', note: 'Tech and Rounded' },
  { family: 'Rye', note: 'Western and Wood' },
  { family: 'Courgette', note: 'Brush and Magical' },
  { family: 'Fira Sans', note: 'Pragmatic and Web' },
  { family: 'Raleway', note: 'Chic and Sans-Serif' },
];

export const FRENCH_FONTS: FontOption[] = [
  { family: 'Bodoni Moda', note: 'Ultra Luxury and Fashion' },
  { family: 'Quicksand', note: 'Minimal and Gentle' },
  { family: 'Marcellus', note: 'Formal, Roman, and Cinematic' },
  { family: 'Monoton', note: 'Quirky and Neon' },
  { family: 'Parisienne', note: 'Romantic and Chic' },
  { family: 'Great Vibes', note: 'Calligraphy and Ceremonial' },
  { family: 'Fascinate', note: 'Art Deco and Vintage' },
  { family: 'Shrikhand', note: 'Retro and Thick' },
  { family: 'Julius Sans One', note: 'Thin and Minimal Chic' },
  { family: 'DM Serif Display', note: 'Bold and Journalistic' },
  { family: 'Special Elite', note: 'Typewriter and Mysterious' },
  { family: 'Playfair Display SC', note: 'Classic Small Caps' },
  { family: 'Nunito', note: 'Modern and Friendly' },
  { family: 'Trocchi', note: 'Casual and Slab Serif' },
  { family: 'Yeseva One', note: 'Feminine and Display' },
  { family: 'Inconsolata', note: 'Coding and Cyber' },
  { family: 'Knewave', note: 'Brush and Street' },
  { family: 'Petit Formal Script', note: 'Invitation and Formal' },
  { family: 'Antic Didone', note: 'Luxury and Magazine' },
  { family: 'Ubuntu', note: 'Modern and Humanist' },
];

export const JAPANESE_FONTS: FontOption[] = [
  { family: 'Noto Serif JP', note: 'Luxury and Aesthetic' },
  { family: 'Noto Sans JP', note: 'Minimal and Clean' },
  { family: 'Zen Old Mincho', note: 'Formal and Historical' },
  { family: 'DotGothic16', note: 'Quirky and Pixelated' },
  { family: 'Kaisei Decol', note: 'Chic and Decorative' },
  { family: 'Zen Maru Gothic', note: 'Round and Gentle' },
  { family: 'Zen Kaku Gothic New', note: 'Sharp and Modern' },
  { family: 'Kaisei Tokumin', note: 'Artistic and Bold' },
  { family: 'Hachi Maru Pop', note: '80s Japanese Retro' },
  { family: 'Reggae One', note: 'Dynamic and Spiked' },
  { family: 'Stick', note: 'Playful and Linear' },
  { family: 'RocknRoll One', note: 'Unique and Dynamic' },
  { family: 'Rampart One', note: '3D and Outline' },
  { family: 'Train One', note: 'Railway and Grooved' },
  { family: 'Klee One', note: 'Handwritten and Neat' },
  { family: 'M PLUS Rounded 1c', note: 'Technological and Friendly' },
  { family: 'Sawarabi Mincho', note: 'Elegant and Novel Writing' },
  { family: 'Kosugi Maru', note: 'Monospace and Pop' },
  { family: 'Yuji Syuku', note: 'Calligraphy and Ceremonial' },
  { family: 'Yusei Magic', note: 'Marker and Street' },
];

export const KOREAN_FONTS: FontOption[] = [
  { family: 'Noto Serif KR', note: 'Luxury and Traditional' },
  { family: 'Noto Sans KR', note: 'Minimal and Corporate' },
  { family: 'Nanum Myeongjo', note: 'Formal and Elegant' },
  { family: 'Kirang Haerang', note: 'Quirky and Rough' },
  { family: 'Stylish', note: 'Chic and Display' },
  { family: 'Do Hyeon', note: 'Retro and Signboard' },
  { family: 'Jua', note: 'Playful and Brush' },
  { family: 'Black And White Picture', note: 'Artistic and Messy' },
  { family: 'Gugi', note: 'Geometric and Unique' },
  { family: 'Song Myung', note: 'Woodblock and Classic' },
  { family: 'Gamja Flower', note: 'Cute and Handwritten' },
  { family: 'Poor Story', note: 'Indie and Personal' },
  { family: 'Sunflower', note: 'Sturdy and Bold' },
  { family: 'Hi Melody', note: 'Pop and Bubbly' },
  { family: 'Yeon Sung', note: 'Dynamic Calligraphy' },
  { family: 'East Sea Dokdo', note: 'Expressionist and Brush' },
  { family: 'Gothic A1', note: 'Very Clean and Legible' },
  { family: 'Single Day', note: 'Romantic and Sweet' },
  { family: 'Gaegu', note: 'Cartoonish and Friendly' },
  { family: 'Nanum Pen Script', note: 'Casual and Fluid' },
];

// Chinese Simplified — kept at its real, honest count (see the
// top-of-file note). Several names from Reza's second pasted list
// were verified NOT to be on Google Fonts at all (Source Han
// Sans/Serif, Alibaba PuHuiTi, DingTalk JinBuTi, Douyu Font — Adobe
// or proprietary-only) and were dropped rather than kept as
// silently-broken entries. Traditional-Chinese-only families (Noto
// Sans/Serif TC, LXGW WenKai TC) were deliberately excluded from THIS
// list even though they're real Google Fonts — they're built for
// Traditional glyph shapes, and this site's "zh" locale is
// Simplified, so including them would reintroduce a subtler version
// of the same "looks technically loaded but visually wrong" problem.
export const CHINESE_FONTS: FontOption[] = [
  { family: 'Noto Sans SC', note: 'Minimal and Standard' },
  { family: 'Noto Serif SC', note: 'Formal and Bookish' },
  { family: 'ZCOOL XiaoWei', note: 'Luxury and Elegant' },
  { family: 'ZCOOL QingKe HuangYou', note: 'Modern and Geometric' },
  { family: 'ZCOOL KuaiLe', note: 'Fun and Cute' },
  { family: 'Ma Shan Zheng', note: 'Quirky, Artistic, and Calligraphic' },
  { family: 'Zhi Mang Xing', note: 'Fluid Calligraphy and Strong' },
  { family: 'Long Cang', note: 'Artistic and Brush' },
  { family: 'Liu Jian Mao Cao', note: 'Loose Brush-Scrawl and Expressive' },
];

export const FONTS_BY_LOCALE: Record<string, FontOption[]> = {
  en: ENGLISH_FONTS,
  es: SPANISH_FONTS,
  fr: FRENCH_FONTS,
  ja: JAPANESE_FONTS,
  ko: KOREAN_FONTS,
  zh: CHINESE_FONTS,
};

// ---- Dynamic loading ----
// Only the fonts actually PICKED get fetched — never the whole catalog.
// A simple in-memory set prevents the same family from being requested
// twice if it's chosen in multiple places on one page.
const _loadedFonts = new Set<string>();

export function loadGoogleFont(family: string): void {
  loadGoogleFonts([family]);
}

/** 2026-07-13 (per Reza — this was the actual cause of a real site-wide
 * hang, not just a font-picker cosmetic issue): loadGoogleFont() used to
 * be called once per family in a loop, each call inserting its OWN
 * <link rel="stylesheet"> — with the picker's ~50+ fonts across all 6
 * languages, opening it once fired 50+ separate stylesheet insertions
 * back to back. Every new stylesheet forces the browser to recompute
 * style for the WHOLE page, not just this component — 50 of those in a
 * tight loop is a full style-recalculation storm, which is exactly what
 * showed up in the Performance profile as heavy "Recalculate style" cost
 * elsewhere on the page.
 *
 * Fix: ONE combined request. Google's Fonts API accepts multiple
 * &family=... params in a single URL — this is one stylesheet insertion
 * total instead of fifty, regardless of how many families are requested.
 * Still true with the larger 2026-07-13 v2 catalog (109 total families
 * across all 6 locales) — this function was never the bottleneck; it
 * batches regardless of catalog size. */
export function loadGoogleFonts(families: string[]): void {
  const toLoad = families.filter((f) => !_loadedFonts.has(f));
  if (toLoad.length === 0) return;
  toLoad.forEach((f) => _loadedFonts.add(f));

  const params = toLoad
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&');
  const href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
