import { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { SchematicPlaceholder } from './conceptArt';
import type { AudioTrack, Locale } from '../types';

/**
 * Cinematic, chapter-based "Selected Works" scroll.
 *
 * One card per concept (the 12 canonical concepts, matching the WorksGallery
 * piano). Each concept shows its FEATURED (starred) track if the admin has
 * starred one; otherwise it shows an elegant schematic placeholder so the
 * section is never empty. The rhythm alternates one-to-one:
 *   [concept] -> [interlude quote] -> [concept] -> [interlude quote] -> ...
 * Cards reveal out of blur + scale, sliding in from alternating sides. A card
 * with a track is click-to-play via the global AudioContext, so playback keeps
 * going as the visitor scrolls on (audio is never tied to viewport visibility).
 */

// The 12 canonical concepts — MUST match WorksGallery ORDER + Admin selector.
const CONCEPT_ORDER = [
  'Cinema', 'Television', 'Games', 'Animation', 'Documentary', 'Advertising',
  'Trailers', 'Theatre', 'Dance', 'Concert', 'Immersive', 'Albums',
] as const;

const CONCEPT_BLURB: Record<string, string> = {
  Cinema: 'Original scores written to live beneath the image.',
  Television: 'Themes and cues that carry a series across seasons.',
  Games: 'Adaptive, interactive music that evolves with the player.',
  Animation: 'Bright, characterful writing that gives motion its heartbeat.',
  Documentary: 'Textural soundscapes that let the real world breathe.',
  Advertising: 'Precise, memorable music built to land in seconds.',
  Trailers: 'High-impact cues engineered to move an audience fast.',
  Theatre: 'Live score for the stage, written to breathe with performers.',
  Dance: 'Music composed for movement, tempo as choreography.',
  Concert: 'Works for the hall, orchestra and ensemble at full scale.',
  Immersive: 'Spatial audio for VR, XR and installation.',
  Albums: 'Long-form artist records under the composer\u2019s own name.',
};

// Cinematic interludes shown between cards (cycle if more gaps than lines).
const INTERLUDES = [
  { kicker: 'Hans Zimmer', line: 'I see music as colours, and I try to paint with sound.' },
  { kicker: 'Ludwig van Beethoven', line: 'Music is the mediator between the spiritual and the sensual life.' },
  { kicker: 'Claude Debussy', line: 'Music is the silence between the notes.' },
  { kicker: 'Johann Sebastian Bach', line: 'The aim of music is to touch the heart and refresh the soul.' },
  { kicker: 'Ennio Morricone', line: 'Silence is also music, and the most important one.' },
  { kicker: 'Igor Stravinsky', line: 'To listen is an effort, and just to hear is no merit.' },
  { kicker: 'Wolfgang Amadeus Mozart', line: 'The music is not in the notes, but in the silence between.' },
  { kicker: 'John Williams', line: 'A great film score reaches the audience before they even know it.' },
  { kicker: 'Frederic Chopin', line: 'Simplicity is the final achievement, the crowning reward of art.' },
  { kicker: 'Gustav Mahler', line: 'The symphony must be like the world; it must embrace everything.' },
  { kicker: 'Leonard Bernstein', line: 'Music can name the unnameable and communicate the unknowable.' },
  { kicker: 'Pyotr Ilyich Tchaikovsky', line: 'Music is the language of the soul, where words fall silent.' },
];

function trackCover(t: AudioTrack): string {
  return t.coverArt?.url || (t as unknown as { coverUrl?: string }).coverUrl || '';
}

// One concept slot: its featured track (if any), else null for a placeholder.
interface ConceptCard {
  concept: string;
  blurb: string;
  track: AudioTrack | null;
  index: number;
}

export default function SpatialScrollEngine() {
  const containerRef = useRef<HTMLElement>(null);
  const { tracks, locale } = useIdentity();
  const safeLocale = (locale ?? 'en') as Locale;
  const { audioState, playTrack, pauseTrack, setPlaylist } = useAudio();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth < 768);
    c();
    window.addEventListener('resize', c);
    return () => window.removeEventListener('resize', c);
  }, []);

  // One card per concept. Featured (starred) live track wins; if several are
  // starred in a concept, the first by sortOrder is used. Concepts with no
  // featured track get a schematic placeholder (track = null).
  const cards = useMemo<ConceptCard[]>(() => {
    const live = (tracks ?? []).filter((t) => t.isLive);
    return CONCEPT_ORDER.map((concept, index) => {
      const featured = live.find((t) => t.isFeatured && (t.concept ?? '') === concept) ?? null;
      return { concept, blurb: CONCEPT_BLURB[concept] ?? '', track: featured, index };
    });
  }, [tracks]);

  // Feed the featured tracks (in order) to the global player as the playlist,
  // so next/prev moves between the featured works. Updates if tracks change.
  const featuredTracks = useMemo(() => cards.map((c) => c.track).filter((t): t is AudioTrack => !!t), [cards]);
  useEffect(() => {
    if (featuredTracks.length) setPlaylist(featuredTracks);
  }, [featuredTracks, setPlaylist]);

  const onCardClick = (track: AudioTrack | null) => {
    if (!track) return;
    const isThis = audioState.currentTrack?.id === track.id;
    if (isThis && audioState.isPlaying) pauseTrack();
    else void playTrack(track);
  };

  const localized = (m: { en?: string } | Record<string, string> | null | undefined): string => {
    if (!m) return '';
    const rec = m as Record<string, string>;
    return rec[safeLocale] || rec.en || '';
  };

  // Build the alternating sequence: card, interlude, card, interlude, ...
  type Slot =
    | { kind: 'card'; card: ConceptCard }
    | { kind: 'interlude'; data: { kicker: string; line: string } };
  const slots: Slot[] = [];
  let interludeCount = 0;
  for (let i = 0; i < cards.length; i += 1) {
    slots.push({ kind: 'card', card: cards[i]! });
    if (i + 1 < cards.length) {
      slots.push({ kind: 'interlude', data: INTERLUDES[interludeCount % INTERLUDES.length]! });
      interludeCount += 1;
    }
  }

  // MOBILE: simple, reliable vertical reveal.
  if (isMobile) {
    return (
      <section className="relative py-16 px-4">
        <header className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
            The Score
          </span>
          <h2 className="text-3xl font-display text-[var(--text-color)] mt-2">Selected Works</h2>
        </header>
        <div className="flex flex-col gap-14">
          {slots.map((slot, si) => {
            if (slot.kind === 'interlude') {
              return (
                <div key={`int-${si}`} className="text-center py-6">
                  <span className="text-xs uppercase tracking-[0.3em] text-[var(--accent-color)] font-mono">
                    {slot.data.kicker}
                  </span>
                  <p className="font-display text-[var(--text-color)] italic leading-snug mt-3"
                     style={{ fontSize: 'clamp(1.4rem, 6vw, 2rem)' }}>
                    {slot.data.line}
                  </p>
                </div>
              );
            }
            const { concept, blurb, track } = slot.card;
            const title = track ? (localized(track.title) || 'Untitled') : concept;
            const desc = track ? localized(track.narrative) : blurb;
            const cover = track ? trackCover(track) : '';
            const isCurrent = !!track && audioState.currentTrack?.id === track.id;
            const isPlaying = isCurrent && audioState.isPlaying;
            return (
              <motion.article
                key={concept}
                initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  type="button"
                  data-cursor={track ? 'play' : undefined}
                  onClick={() => onCardClick(track)}
                  className="block w-full text-left focus:outline-none"
                  style={{ cursor: track ? 'pointer' : 'default' }}
                  aria-label={track ? `${isPlaying ? 'Pause' : 'Play'} ${title}` : `${concept} — coming soon`}
                >
                  <div className="relative overflow-hidden rounded-3xl" style={{ aspectRatio: '16 / 10' }}>
                    {cover ? (
                      <img src={cover} alt={title} crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                        style={{
                          WebkitMaskImage: 'radial-gradient(140% 130% at 50% 45%, #000 60%, transparent 100%)',
                          maskImage: 'radial-gradient(140% 130% at 50% 45%, #000 60%, transparent 100%)',
                        }} />
                    ) : (
                      <SchematicPlaceholder concept={concept} />
                    )}
                    {isCurrent && <NowPlaying active={isPlaying} />}
                  </div>
                  <div className="mt-4">
                    <span className="text-[0.7rem] uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">{concept}</span>
                    <h3 className="text-2xl font-display text-[var(--text-color)] leading-tight mt-1 mb-1">{title}</h3>
                    {desc && <p className="text-sm text-[var(--text-muted-color)]">{desc}</p>}
                  </div>
                </button>
              </motion.article>
            );
          })}
        </div>
      </section>
    );
  }

  // DESKTOP: each slot is a full-height scene that reveals cinematically
  // (blur + scale + alternating slide) as it enters view.
  return (
    <section ref={containerRef} className="relative">
      <header className="h-[60vh] flex flex-col items-center justify-center text-center px-8">
        <span className="text-xs uppercase tracking-[0.25em] text-[var(--accent-color)] font-mono">
          The Score
        </span>
        <h2 className="text-5xl md:text-7xl font-display text-[var(--text-color)] mt-3">
          Selected Works
        </h2>
      </header>

      <div style={{ perspective: '1600px' }}>
        {slots.map((slot, si) => {
          if (slot.kind === 'interlude') {
            return (
              <div
                key={`int-${si}`}
                className="flex items-center justify-center px-8 text-center"
                style={{ minHeight: '22vh' }}
              >
                <motion.div
                  initial={{ opacity: 0, filter: 'blur(10px)', y: 40 }}
                  whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  viewport={{ once: false, amount: 0.6 }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-none rounded-3xl px-10 py-8"
                  style={{
                    background:
                      'radial-gradient(120% 120% at 50% 50%, rgba(var(--surface-rgb),0.85) 40%, rgba(var(--surface-rgb),0.45) 75%, transparent 100%)',
                  }}
                >
                  <span className="text-xs uppercase tracking-[0.3em] text-[var(--accent-color)] font-mono">
                    {slot.data.kicker}
                  </span>
                  <p
                    className="font-display text-[var(--text-color)] mt-5 whitespace-nowrap"
                    style={{ fontSize: 'clamp(0.7rem, 2vw, 1.4rem)', fontStyle: 'italic', lineHeight: 1.2 }}
                  >
                    {slot.data.line}
                  </p>
                </motion.div>
              </div>
            );
          }

          const { concept, blurb, track, index } = slot.card;
          const title = track ? (localized(track.title) || 'Untitled') : concept;
          const desc = track ? localized(track.narrative) : blurb;
          const cover = track ? trackCover(track) : '';
          const year = track ? new Date(track.createdAt).getFullYear() : null;
          const isCurrent = !!track && audioState.currentTrack?.id === track.id;
          const isPlaying = isCurrent && audioState.isPlaying;

          // Alternate the entrance direction: even from left, odd from right.
          const fromLeft = index % 2 === 0;
          const enterX = fromLeft ? -120 : 120;

          return (
            <div key={concept} className="flex items-center justify-center px-6 md:px-16" style={{ minHeight: '78vh' }}>
              <motion.article
                initial={{ opacity: 0, filter: 'blur(12px)', scale: 0.94, x: enterX }}
                whileInView={{ opacity: 1, filter: 'blur(0px)', scale: 1, x: 0 }}
                viewport={{ once: false, amount: 0.5 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-5xl grid md:grid-cols-12 gap-8 items-center"
              >
                <div className="md:col-span-7">
                  <button
                    type="button"
                    data-cursor={track ? 'play' : undefined}
                    onClick={() => onCardClick(track)}
                    className="block w-full focus:outline-none group"
                    style={{ cursor: track ? 'pointer' : 'default' }}
                    aria-label={track ? `${isPlaying ? 'Pause' : 'Play'} ${title}` : `${concept} — coming soon`}
                  >
                    <div
                      className="relative overflow-hidden rounded-3xl"
                      style={{ aspectRatio: '16 / 10', border: isCurrent ? '1px solid var(--accent-color)' : '1px solid transparent', transition: 'border-color 0.4s ease' }}
                    >
                      {cover ? (
                        <img
                          src={cover}
                          alt={title}
                          crossOrigin="anonymous"
                          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                          style={{
                            WebkitMaskImage: 'radial-gradient(135% 125% at 50% 45%, #000 62%, transparent 100%)',
                            maskImage: 'radial-gradient(135% 125% at 50% 45%, #000 62%, transparent 100%)',
                          }}
                        />
                      ) : (
                        <SchematicPlaceholder concept={concept} />
                      )}
                      <div
                        className="absolute inset-0 pointer-events-none rounded-3xl"
                        style={{ background: 'linear-gradient(125deg, rgba(255,255,255,0.08), transparent 40%)' }}
                      />
                      {/* Now-playing equaliser on the featured/current track */}
                      {isCurrent && <NowPlaying active={isPlaying} />}
                      {/* Hover play hint when a track exists but isn't current */}
                      {track && !isCurrent && (
                        <div
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
                          style={{ background: 'rgba(0,0,0,0.22)', transition: 'opacity 0.4s ease' }}
                          aria-hidden
                        >
                          <span className="flex items-center justify-center rounded-full"
                            style={{ width: '54px', height: '54px', border: '1px solid rgba(255,255,255,0.75)', background: 'rgba(0,0,0,0.25)' }}>
                            <svg width="18" height="18" viewBox="0 0 16 16"><path d="M5 3 L13 8 L5 13 Z" fill="#fff" /></svg>
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                </div>

                <div
                  className="md:col-span-5 rounded-2xl px-5 py-6"
                  style={{
                    background:
                      'linear-gradient(120deg, rgba(var(--surface-rgb),0.82), rgba(var(--surface-rgb),0.4))',
                  }}
                >
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="text-[0.7rem] uppercase tracking-[0.2em] text-[var(--accent-color)] font-mono">
                      {concept}
                    </span>
                    {year ? (
                      <span className="text-[0.7rem] text-[var(--text-muted-color)] font-mono">{year}</span>
                    ) : null}
                  </div>
                  <h3 className="font-display text-[var(--text-color)] leading-[1.05] mb-4"
                      style={{ fontSize: 'clamp(1.9rem, 3.6vw, 3.25rem)' }}>
                    {title}
                  </h3>
                  {desc && (
                    <p className="text-sm md:text-base text-[var(--text-muted-color)] leading-relaxed">
                      {desc}
                    </p>
                  )}
                  {!track && (
                    <p className="text-[0.7rem] uppercase tracking-[0.25em] text-[var(--text-dim-color)] font-mono mt-4">
                      In composition
                    </p>
                  )}
                </div>
              </motion.article>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Luxe "now playing" equaliser — five slim gold bars gently rising/falling.
function NowPlaying({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div
      className="absolute inset-0 flex items-end justify-center gap-[4px] pointer-events-none"
      style={{ padding: '0 0 12%', background: 'linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0.04) 55%, transparent)' }}
      aria-hidden
    >
      {bars.map((b) => (
        <motion.span
          key={b}
          style={{
            width: 'clamp(4px, 0.6vw, 7px)',
            borderRadius: '2px',
            background: 'linear-gradient(to top, var(--accent2-color, #B8960C), var(--accent-color))',
            boxShadow: '0 0 10px rgba(212,175,55,0.5)',
          }}
          initial={{ height: '12%' }}
          animate={active ? { height: ['18%', '60%', '32%', '52%', '22%'] } : { height: '14%' }}
          transition={active ? { duration: 1.1 + b * 0.18, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay: b * 0.08 } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}
