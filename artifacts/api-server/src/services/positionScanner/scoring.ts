// ============================================================
// Business Scanner — rule-based relevance scoring (Phase 5 / A3c)
//
// Works with ZERO API keys. When an AI key is configured (a later build
// step), the LLM pass re-scores and extracts structured fields more
// precisely — but this function is never bypassed entirely: it's always
// the first pass, and remains the ONLY pass for anyone running without an
// AI key configured. That's the whole point of the source-agnostic design
// Reza asked for: the scanner has to be genuinely useful on RSS + rules
// alone.
//
// v2 (2026-07-13, per Reza): a professional composer's work is never just
// "film score" — it's every one of the 12 Selected-Works concepts (Cinema,
// Television, Games, Animation, Documentary, Advertising, Trailers,
// Theatre, Dance, Concert, Immersive, Albums), PLUS the craft disciplines
// underneath all of them: sound engineering, sound design, mixing,
// mastering, orchestration, arranging, music supervision, ADR/foley music,
// source music licensing, session direction. The keyword set below is
// organized by discipline (not one flat list) specifically so it stays
// maintainable as it grows — each block maps to something concrete a
// composer-for-hire actually does, not a generic "music industry" term.
// ============================================================

interface KeywordSet {
  strong: string[]; // near-certain match ("film composer", "score the film")
  medium: string[]; // relevant but generic ("original music", "soundtrack")
  negative: string[]; // present -> probably ISN'T composing/audio work (sales, legal, IT, HR)
}

// ---- English keyword set, organized by the discipline it targets ----
// (Kept as one exported constant built from smaller labeled arrays, rather
// than one giant unlabeled list, so any future edit knows exactly which
// concept/discipline a term belongs to.)

const SCREEN_SCORING = [
  // Cinema / Television / Trailers / Documentary — writing music TO PICTURE
  'film composer', 'film score', 'score composer', 'composer for film',
  'tv composer', 'television composer', 'composer for television',
  'trailer composer', 'trailer music composer', 'trailer music house',
  'documentary composer', 'documentary score', 'score a documentary',
  'original score', 'scoring composer', 'music for film', 'music for tv',
  'music for television', 'underscore composer', 'spotting session',
];

const GAME_AUDIO = [
  // Games / Immersive — interactive & adaptive music, plus the broader
  // audio-implementation work that composers on game teams are asked to do
  'game composer', 'game music composer', 'video game score',
  'video game composer', 'interactive music composer', 'adaptive music',
  'music for games', 'game audio composer', 'composer for games',
  'wwise composer', 'fmod composer', 'audio middleware composer',
  'vr composer', 'xr composer', 'spatial audio composer', 'immersive audio composer',
];

const ANIMATION_SCORING = [
  // Animation — its own discipline (different pacing/timing conventions
  // than live-action scoring), worth its own strong terms
  'animation composer', 'composer for animation', 'animated feature composer',
  'animated series composer', 'cartoon composer',
];

const ADVERTISING_MUSIC = [
  // Advertising — commercial/jingle/branding music, a real, distinct
  // composing discipline with its own job titles
  'advertising composer', 'commercial composer', 'jingle composer',
  'brand music composer', 'music for advertising', 'ad music composer',
  'sonic branding', 'audio branding composer',
];

const THEATRE_DANCE_CONCERT = [
  // Theatre / Dance / Concert — live-performance composing, orchestral
  // and stage work, distinct from screen scoring
  'theatre composer', 'theater composer', 'musical theatre composer',
  'incidental music composer', 'dance composer', 'ballet composer',
  'choreographic composer', 'concert composer', 'orchestral composer',
  'commissioned composer', 'composer in residence', 'ensemble composer',
  'chamber music composer',
];

const ALBUMS_PRODUCTION = [
  // Albums — the composer's own recorded work / production-for-hire,
  // distinct from writing to someone else's picture or brief
  'album composer', 'record producer composer', 'composer-producer',
  'original album', 'concept album composer',
];

const SOUND_CRAFT = [
  // The engineering/design disciplines Reza explicitly asked to include —
  // real job titles a professional composer's studio work touches, not
  // just "writing notes"
  'sound designer', 'sound design composer', 'sound engineer composer',
  'audio engineer composer', 'mixing engineer', 'mastering engineer',
  'orchestrator', 'orchestration', 'music arranger', 'arranger composer',
  'music supervisor', 'music editor', 'scoring mixer', 'dubbing mixer',
  'foley composer', 'adr music', 'source music supervisor',
  'session musician director', 'conductor composer', 'music production for picture',
  'post-production composer', 'audio post composer',
];

const GENERIC_STRONG = [
  ...SCREEN_SCORING, ...GAME_AUDIO, ...ANIMATION_SCORING, ...ADVERTISING_MUSIC,
  ...THEATRE_DANCE_CONCERT, ...ALBUMS_PRODUCTION, ...SOUND_CRAFT,
];

const MEDIUM_TERMS = [
  'composer', 'composing', 'soundtrack', 'original music', 'underscore',
  'cue', 'cues', 'scoring session', 'music production', 'orchestration',
  'sound design', 'audio production', 'music licensing', 'score revisions',
  'temp score', 'thematic material', 'leitmotif', 'demo reel composer',
];

const NEGATIVE_TERMS = [
  'sales', 'legal', 'attorney', 'accountant', 'accounting', 'human resources',
  'it support', 'marketing manager', 'publicist', 'talent agent', 'casting',
  'stage manager', 'production assistant', 'internship unpaid', 'e-commerce',
  'executive assistant', 'business affairs', 'facilities manager',
  'social media', 'influencer', 'partnerships manager', 'promotion manager',
];

// English is the fullest set today because our only wired source
// (EntertainmentCareers.Net) is English-only. The per-discipline arrays
// above ARE the multilingual-ready structure — adding a Spanish/French/
// etc. translation of each block is a one-line addition per language, not
// a redesign. Genuine non-English relevance still needs non-English
// SOURCES too (a later step alongside Google Programmable Search), not
// just translated keywords applied to English listings.
const KEYWORDS: Record<string, KeywordSet> = {
  en: { strong: GENERIC_STRONG, medium: MEDIUM_TERMS, negative: NEGATIVE_TERMS },
};

export interface ScoreResult {
  score: number; // 0-100
  lang: string;
}

/** Scores a raw title+summary against the keyword rules. No network calls,
 * no AI — pure string matching, always available. */
export function scoreLeadByRules(title: string, summary: string, lang = 'en'): ScoreResult {
  const text = `${title} ${summary}`.toLowerCase();
  const set = KEYWORDS[lang] ?? KEYWORDS.en!;

  let score = 0;
  for (const term of set.strong) if (text.includes(term)) score += 35;
  for (const term of set.medium) if (text.includes(term)) score += 12;
  for (const term of set.negative) if (text.includes(term)) score -= 30;

  score = Math.max(0, Math.min(100, score));
  return { score, lang };
}

/** The full strong-term list, exported separately so the Google
 * Programmable Search adapter can build its search QUERIES from the exact
 * same vocabulary this function scores against — one source of truth for
 * "what a composer's work looks like", not two lists that can drift apart. */
export const COMPOSER_QUERY_TERMS = {
  screenScoring: SCREEN_SCORING,
  gameAudio: GAME_AUDIO,
  animation: ANIMATION_SCORING,
  advertising: ADVERTISING_MUSIC,
  theatreDanceConcert: THEATRE_DANCE_CONCERT,
  albums: ALBUMS_PRODUCTION,
  soundCraft: SOUND_CRAFT,
};
