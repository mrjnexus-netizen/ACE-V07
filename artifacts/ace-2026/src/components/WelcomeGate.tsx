import { useState } from 'react';
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
  font-size:clamp(3.8rem,13vw,8.2rem);line-height:1.05;letter-spacing:.005em;
  padding:.22em .1em .16em;
  background:linear-gradient(96deg,
    #5E6266 0%, #A9AFB6 16%, #FFFFFF 33%, #DCDFE3 45%,
    #FFFFFF 57%, #9BA0A6 73%, #C7CBD0 87%, #5E6266 100%);
  background-size:280% 100%;background-position:20% 0;
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.5)) drop-shadow(0 0 9px rgba(220,223,227,.13));
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
  color:#DCDFE3;background:rgba(255,255,255,.025);
  border:1px solid rgba(200,162,76,.34);
  cursor:pointer;backdrop-filter:blur(6px);
  transition:.55s cubic-bezier(.22,1,.36,1);
}
.wg-btn::before{
  content:'';position:absolute;inset:0;border-radius:inherit;z-index:-1;
  background:radial-gradient(120% 150% at 50% 130%,rgba(200,162,76,.26),transparent 62%);
  opacity:0;transition:opacity .55s cubic-bezier(.22,1,.36,1);
}
.wg-btn:hover{
  color:#fff;border-color:rgba(200,162,76,.8);transform:translateY(-2px);
  text-shadow:0 0 14px rgba(200,162,76,.45);box-shadow:0 0 26px -8px rgba(200,162,76,.5);
}
.wg-btn:hover::before{ opacity:1 }
.wg-btn:focus-visible{ outline:2px solid rgba(200,162,76,.85);outline-offset:3px }

@keyframes wgFadeUp{ from{opacity:0;transform:translateY(9px)} to{opacity:1;transform:translateY(0)} }

@media(prefers-reduced-motion:reduce){
  .wg-lede,.wg-sign,.wg-rule,.wg-rule i,.wg-enter{animation:none!important;opacity:1!important}
  .wg-sign{clip-path:none!important}
  .wg-signtext{animation:none!important}
  .wg-rule i{width:clamp(70px,16vw,150px)!important}
}
`;

const WelcomeGate = ({ onEnter }: { onEnter: () => void }) => {
  const { t } = useT();
  const [leaving, setLeaving] = useState(false);

  const handleEnter = () => {
    if (leaving) return;
    setLeaving(true);
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
