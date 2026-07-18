import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '../context/TranslationContext';

/**
 * WelcomeGate — cinematic entry curtain shown over the living starfield before
 * the language portal. Beneath a gold "Step into the world of" line, the
 * composer's name signs itself on in silver ("Amir Moslehi") as a pen-light
 * rides the writing edge; a fine gold node draws in, then a single quiet
 * "Enter" hands off to the portal.
 *
 * The background stays transparent so the galaxy and its animations show
 * through untouched. The Enter click is the user gesture that unlocks audio,
 * so onEnter() both starts the ambient music and dismisses the gate into the
 * language portal (the smooth fade/hand-off is preserved).
 *
 * W2: a near-silent synthesized ambient drone (Web Audio oscillators, no
 * external asset — no license risk) fades in to a very low ceiling on the
 * first qualifying user gesture (pointerdown/keydown/touchstart — mousemove
 * does NOT count under browser autoplay policy), and fades out over ~1.2s
 * the moment Enter is pressed, handing off to the portal's own ambience.
 *
 * All styles are namespaced under .wg- to avoid colliding with site CSS.
 */

const WG_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400;1,500&family=Great+Vibes&family=Inter:wght@400;500&display=swap');

.wg-stage{ text-align:center; padding:0 24px; }

/* gold lede */
.wg-lede{
  font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;
  font-size:clamp(1rem,2.3vw,1.42rem);letter-spacing:.05em;
  background:linear-gradient(90deg,#7A5E22,#EBD9A6 45%,#C8A24C 72%,#7A5E22);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  opacity:0;margin-bottom:.12em;
  animation:wgLedeIn 1.5s cubic-bezier(.22,1,.36,1) .35s forwards;
}
@keyframes wgLedeIn{
  0%{opacity:0;transform:translateY(9px);letter-spacing:.2em}
  100%{opacity:1;transform:translateY(0);letter-spacing:.05em}
}

/* signature reveal — a DIAGONAL "/" wipe (constant-slope leading edge sweeping
   lower-left → upper-right), like a calligrapher's oblique stroke. polygon()
   interpolates smoothly (4 matching points). Top/bottom overshoot keeps tall
   swashes / descenders from ever being clipped. */
.wg-sign{
  position:relative;display:inline-block;
  clip-path:polygon(-60% -40%, 10% -40%, -54% 140%, -60% 140%);
  animation:wgSign 3400ms cubic-bezier(.5,.08,.35,1) 900ms forwards;
}
@keyframes wgSign{ to{ clip-path:polygon(-60% -40%, 154% -40%, 90% 140%, -60% 140%) } }

.wg-signtext{
  font-family:'Great Vibes',cursive;font-weight:400;
  /* 2026-07-17 (site-wide responsive audit, per Reza): the old floor
     (3.8rem = 60.8px) was HIGHER than what 13vw actually gives on a
     375px phone (~48.75px = 3.05rem) -- clamp() can never go below its
     floor, so narrow phones were forced to 60.8px regardless, leaving
     "Amir Moslehi" in a script font tight against (or past) the 24px
     side padding in .wg-stage. Lowering the floor to 2.6rem lets the
     real fluid value apply all the way down to small phones; the 8.2rem
     ceiling (desktop) is untouched. */
  font-size:clamp(2.6rem,13vw,8.2rem);line-height:1.05;letter-spacing:.005em;
  padding:.22em .1em .16em;
  /* 2026-07-13 (per Reza — minimal theme support): this used to be a fixed
     silver/white gradient (several literal #FFFFFF stops) — beautiful on a
     dark background, functionally invisible on a light one (white text on
     near-white ivory). Building it from var(--text-color) instead means it
     keeps its exact current silvery shimmer on onyx/cyber (their
     --text-color is already near-white) and automatically becomes a dark
     shimmer on minimal (--text-color there is near-black) — same
     technique, no separate light-mode gradient to maintain. */
  background:linear-gradient(96deg,
    color-mix(in srgb, var(--text-color) 45%, transparent) 0%,
    color-mix(in srgb, var(--text-color) 88%, var(--accent-color) 12%) 16%,
    var(--text-color) 33%,
    color-mix(in srgb, var(--text-color) 92%, transparent) 45%,
    var(--text-color) 57%,
    color-mix(in srgb, var(--text-color) 85%, var(--accent-color) 15%) 73%,
    color-mix(in srgb, var(--text-color) 75%, transparent) 87%,
    color-mix(in srgb, var(--text-color) 45%, transparent) 100%);
  background-size:280% 100%;background-position:20% 0;
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.35)) drop-shadow(0 0 9px rgba(var(--accent-rgb),.16));
  display:inline-block;
  animation:wgShimmer 7s ease-in-out 4300ms infinite;
}
@keyframes wgShimmer{ 0%,100%{background-position:20% 0} 50%{background-position:80% 0} }

/* gold hairline node */
.wg-rule{
  display:flex;align-items:center;justify-content:center;gap:14px;margin-top:26px;opacity:0;
  animation:wgFadeUp 1.1s cubic-bezier(.22,1,.36,1) 4450ms forwards;
}
.wg-rule i{
  height:1px;width:0;background:linear-gradient(90deg,transparent,rgba(200,162,76,.7));
  animation:wgRuleGrow 1.1s cubic-bezier(.22,1,.36,1) 4450ms forwards;
}
.wg-rule i:last-child{ background:linear-gradient(90deg,rgba(200,162,76,.7),transparent) }
.wg-rule span{
  width:5px;height:5px;transform:rotate(45deg);background:#C8A24C;
  box-shadow:0 0 10px rgba(200,162,76,.7);flex:none;
}
@keyframes wgRuleGrow{ to{ width:clamp(70px,16vw,150px) } }

/* enter */
.wg-enter{ margin-top:52px;opacity:0;animation:wgFadeUp 1.1s cubic-bezier(.22,1,.36,1) 4650ms forwards }
.wg-btn{
  position:relative;isolation:isolate;
  padding:15px 46px;border-radius:999px;
  font-family:'Inter',system-ui,sans-serif;font-size:.76rem;font-weight:500;
  letter-spacing:.32em;text-transform:uppercase;
  /* 2026-07-13 (per Reza — "Enter button faded"): was a fixed light-gray
     (#DCDFE3) on near-transparent white — invisible on a light surface.
     var(--text-color)/accent-tinted glass now tracks whichever theme is
     actually live. */
  color:var(--text-color);background:rgba(var(--accent-rgb),.05);
  border:1px solid rgba(var(--accent-rgb),.34);
  cursor:pointer;backdrop-filter:blur(6px);
  transition:.55s cubic-bezier(.22,1,.36,1);
}
.wg-btn::before{
  content:'';position:absolute;inset:0;border-radius:inherit;z-index:-1;
  background:radial-gradient(120% 150% at 50% 130%,rgba(var(--accent-rgb),.26),transparent 62%);
  opacity:0;transition:opacity .55s cubic-bezier(.22,1,.36,1);
}
.wg-btn:hover{
  color:var(--accent-color);border-color:rgba(var(--accent-rgb),.8);transform:translateY(-2px);
  text-shadow:0 0 14px rgba(var(--accent-rgb),.45);box-shadow:0 0 26px -8px rgba(var(--accent-rgb),.5);
}
.wg-btn:hover::before{ opacity:1 }
.wg-btn:focus-visible{ outline:2px solid rgba(var(--accent-rgb),.85);outline-offset:3px }

@keyframes wgFadeUp{ from{opacity:0;transform:translateY(9px)} to{opacity:1;transform:translateY(0)} }

@media(prefers-reduced-motion:reduce){
  .wg-lede,.wg-sign,.wg-rule,.wg-rule i,.wg-enter{animation:none!important;opacity:1!important}
  .wg-sign{clip-path:none!important}
  .wg-signtext{animation:none!important}
  .wg-rule i{width:clamp(70px,16vw,150px)!important}
}
`;

/* ---------- W2: gate ambience — synthesized, module-level singleton ---------- */

const GATE_CEILING = 0.12;
const GATE_FADE_IN_MS = 2200;
const GATE_FADE_OUT_MS = 1200;

let gateCtx: AudioContext | null = null;
let gateMasterGain: GainNode | null = null;
let gateOscillators: OscillatorNode[] = [];
let gateStarted = false;
let gateFadedOut = false;

function startGateAmbience() {
  if (gateStarted) return;
  gateStarted = true;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    gateCtx = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);
    gateMasterGain = masterGain;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 460;
    filter.Q.value = 0.3;
    filter.connect(masterGain);

    // two deep, gently detuned sines — a calm, wordless breath under the gate
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55; // A1
    const g1 = ctx.createGain();
    g1.gain.value = 0.6;
    osc1.connect(g1).connect(filter);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55 * 1.006; // slight detune -> slow, gentle beating
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    osc2.connect(g2).connect(filter);

    // very slow LFO breathing the filter cutoff so it never feels static
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain).connect(filter.frequency);

    osc1.start();
    osc2.start();
    lfo.start();
    gateOscillators = [osc1, osc2, lfo];

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(GATE_CEILING, now + GATE_FADE_IN_MS / 1000);
  } catch {
    // ambience is a nicety, never a blocker — fail silently
  }
}

function stopGateAmbience() {
  if (!gateCtx || !gateMasterGain || gateFadedOut) return;
  gateFadedOut = true;
  const ctx = gateCtx;
  const masterGain = gateMasterGain;
  const oscillators = gateOscillators;
  try {
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + GATE_FADE_OUT_MS / 1000);
  } catch {
    // ignore
  }
  setTimeout(() => {
    try {
      oscillators.forEach((o) => o.stop());
      ctx.close();
    } catch {
      // ignore
    }
  }, GATE_FADE_OUT_MS + 150);
}

/* ------------------------------------------------------------------------ */

const WelcomeGate = ({ onEnter }: { onEnter: () => void }) => {
  const { t } = useT();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const onGesture = () => startGateAmbience();
    // qualifying user-activation events only — mousemove does NOT count
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    window.addEventListener('touchstart', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      window.removeEventListener('touchstart', onGesture);
    };
  }, []);

  const handleEnter = () => {
    if (leaving) return;
    setLeaving(true);
    stopGateAmbience();
    // let the fade play, then hand off to the portal
    setTimeout(onEnter, 1100);
  };

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
          style={{ background: 'transparent' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        >
          <style dangerouslySetInnerHTML={{ __html: WG_STYLES }} />

          <div className="wg-stage">
            <p className="wg-lede">{t('Step into the world of')}</p>

            <div className="wg-sign">
              <span className="wg-signtext">Amir Moslehi</span>
            </div>

            <div className="wg-rule" aria-hidden="true"><i /><span /><i /></div>

            <div className="wg-enter">
              <button className="wg-btn" onClick={handleEnter} aria-label={t('Enter')}>
                {t('Enter')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeGate;
