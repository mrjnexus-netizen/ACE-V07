import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { apiPost } from '../lib/apiClient';
import { useT } from '../context/TranslationContext';

interface ChatMessage {
  role: 'bot' | 'user';
  text: string;
  trackId?: string;
  timestamp: string;
}

interface ChatApiResponse {
  reply: string;
  trackRecommendation?: string | null;
  degraded?: boolean;
}

// Brief questions, in the exact order the backend brief fields expect:
// [0] mediaType  [1] emotionalDirection  [2] budgetRange  [3] deadline
const BRIEF_QUESTIONS = [
  'What type of media? (film / game / animation / documentary / commercial)',
  'What emotional direction? (3 keywords)',
  "What's your budget range? (below $5k / $5k-$25k / $25k-$100k / above $100k)",
  "When's your deadline?",
];

const LOCAL_FALLBACK =
  'I can\u2019t reach the studio service right now, but you can still start a project \u2014 just type "brief" and I\u2019ll collect the details.';

// 2026-07-14 (per Reza — luxury re-skin + per-language icon color): a
// bespoke sound-wave glyph instead of the generic 💬 emoji. Uses
// currentColor so it automatically follows --accent-color, which
// ChromaticContext already updates per language (no new plumbing needed
// for "per-language colored icon" — the color system this ties into was
// already sitewide).
function StudioBotIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <path
        d="M10 17.5V14.5M13.4 20V12M16.8 22V10M20.2 19V13M23.6 16.5V15.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ExecutiveStudioBot() {
  const { locale, tracks } = useIdentity();
  const { playTrack } = useAudio();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text:
        "Hello! I'm the ACE Studio Manager. How can I assist you today?\n" +
        'If you\u2019d like Amir to personally reach out, feel free to share your contact details and what you need.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [collectingBrief, setCollectingBrief] = useState(false);
  const [briefData, setBriefData] = useState<string[]>([]);
  const [briefStep, setBriefStep] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 2026-07-14 (per Reza — persisted chat logs): one ID per widget
  // session, sent with every turn so the backend can upsert one row per
  // conversation instead of needing a separate "save" step.
  const conversationIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  );

  const safeLocale = locale ?? 'en';
  const { t } = useT();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Real chat: POST /api/chat with message + conversation history ---
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      const userMsg: ChatMessage = { role: 'user', text, timestamp: new Date().toISOString() };
      // Last 20 turns (incl. this one) for backend context.
      const history = [...messages, userMsg].slice(-20).map((m) => ({ role: m.role, text: m.text }));
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      try {
        const data = await apiPost<ChatApiResponse | null>('/api/chat', {
          message: text,
          history,
          locale: safeLocale,
          conversationId: conversationIdRef.current,
        });
        const reply = data?.reply?.trim();
        setMessages((prev) => [
          ...prev,
          {
            role: 'bot',
            text: reply && reply.length > 0 ? reply : LOCAL_FALLBACK,
            trackId: data?.trackRecommendation ?? undefined,
            timestamp: new Date().toISOString(),
          },
        ]);
      } catch {
        // Graceful degradation: network/demo failure never breaks the UI.
        setMessages((prev) => [
          ...prev,
          { role: 'bot', text: LOCAL_FALLBACK, timestamp: new Date().toISOString() },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, safeLocale],
  );

  // --- Persist a completed brief: POST /api/briefs (no key required) ---
  const submitBrief = useCallback(
    async (collected: string[], conversation: ChatMessage[]): Promise<boolean> => {
      try {
        await apiPost<{ id: string }>('/api/briefs', {
          locale: safeLocale,
          mediaType: collected[0] ?? null,
          emotionalDirection: collected[1] ?? null,
          budgetRange: collected[2] ?? null,
          deadline: collected[3] ?? null,
          rawConversation: conversation.map((m) => ({ role: m.role, text: m.text, timestamp: m.timestamp })),
        });
        return true;
      } catch {
        return false;
      }
    },
    [safeLocale],
  );

  const handleBriefCollection = useCallback(
    (answer: string) => {
      const newBriefData = [...briefData, answer];
      setBriefData(newBriefData);

      if (briefStep < BRIEF_QUESTIONS.length - 1) {
        const nextStep = briefStep + 1;
        setBriefStep(nextStep);
        setMessages((prev) => [
          ...prev,
          { role: 'user', text: answer, timestamp: new Date().toISOString() },
          { role: 'bot', text: BRIEF_QUESTIONS[nextStep]!, timestamp: new Date().toISOString() },
        ]);
        setInput('');
        return;
      }

      // Final answer collected -> persist to backend.
      setCollectingBrief(false);
      setBriefStep(0);
      setBriefData([]);
      setInput('');

      const userAnswer: ChatMessage = { role: 'user', text: answer, timestamp: new Date().toISOString() };
      const conversation = [...messages, userAnswer];
      setMessages((prev) => [...prev, userAnswer]);

      const summary = `Type: ${newBriefData[0] ?? '-'}\nDirection: ${newBriefData[1] ?? '-'}\nBudget: ${newBriefData[2] ?? '-'}\nDeadline: ${newBriefData[3] ?? '-'}`;

      void submitBrief(newBriefData, conversation).then((ok) => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'bot',
            text: ok
              ? `Brief submitted \u2014 the studio will be in touch.\n${summary}`
              : `I couldn\u2019t reach the studio service to file your brief. Please try again shortly.\n${summary}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      });
    },
    [briefData, briefStep, messages, submitBrief],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (collectingBrief) {
      handleBriefCollection(input);
    } else if (input.toLowerCase().includes('brief') || input.toLowerCase().includes('project')) {
      setCollectingBrief(true);
      setBriefStep(0);
      setBriefData([]);
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: input, timestamp: new Date().toISOString() },
        { role: 'bot', text: BRIEF_QUESTIONS[0]!, timestamp: new Date().toISOString() },
      ]);
      setInput('');
    } else {
      void sendMessage(input);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* 2026-07-14 (per Reza — luxury re-skin): soft breathing glow ring
          behind the launcher, same "everything breathes" language as the
          orb/button auras elsewhere on the site (§6.6 design language).
          Icon + ring both use currentColor -> var(--accent-color), so this
          is already per-language colored via the existing Chromatic system. */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setIsMinimized(false);
        }}
        className="fixed right-6 w-12 h-12 rounded-full flex items-center justify-center shadow-lg z-50 hover:scale-105 active:scale-95 transition-all csb-launcher"
        style={{
          background: 'linear-gradient(145deg, var(--surface3-color), var(--surface2-color))',
          color: 'var(--accent-color)',
          border: '1px solid var(--border-accent-color)',
          // 2026-07-17 (site-wide responsive audit, per Reza): was a fixed
          // bottom-24 (96px) — on mobile, once PersistentAudioPlayer is
          // tapped open (120px expanded), this launcher sat partly BEHIND
          // it (player is z-9999, launcher z-50). --pap-h is 0px whenever
          // no track is loaded, so this is a no-op until it's actually needed.
          bottom: 'calc(6rem + var(--pap-h, 0px))',
          // 'all' (not just 'bottom') so this inline transition doesn't
          // clobber the className's transition-all (hover/active scale).
          transition: 'all 300ms ease',
        }}
        aria-label={t('Studio Bot')}
      >
        <span className="csb-launcher-glow" style={{ boxShadow: '0 0 0 0 var(--glow-color)' }} />
        <StudioBotIcon size={19} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              height: isMinimized ? 52 : 440,
            }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed right-6 w-[300px] max-w-[86vw] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden csb-panel"
            style={{
              // Same --pap-h offset as the launcher button above, so the
              // open chat panel never sits partly behind the audio player
              // either.
              bottom: 'calc(6rem + var(--pap-h, 0px))',
              background: 'linear-gradient(175deg, rgba(var(--surface-rgb),0.94), rgba(var(--surface-rgb),0.82))',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              border: '1px solid var(--border-accent-color)',
            }}
          >
            <div
              className="px-3.5 py-2.5 flex justify-between items-center shrink-0"
              style={{ borderBottom: isMinimized ? 'none' : '1px solid var(--border-accent-color)' }}
            >
              <span className="flex items-center gap-1.5" style={{ color: 'var(--accent-color)' }}>
                <StudioBotIcon size={14} />
                <span className="csb-title">{t('Studio Bot')}</span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized((m) => !m)}
                  aria-label={t(isMinimized ? 'Expand' : 'Minimize')}
                  className="csb-icon-btn"
                >
                  {isMinimized ? '\u25A2' : '\u2013'}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label={t('Close')}
                  className="csb-icon-btn"
                >
                  {'\u2715'}
                </button>
              </span>
            </div>
            {!isMinimized && (
              <>
                <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className="max-w-[82%] rounded-lg px-2.5 py-2 text-[12.5px] leading-snug whitespace-pre-line csb-bubble"
                        style={
                          msg.role === 'user'
                            ? {
                                background: 'linear-gradient(135deg, var(--accent-color), var(--accent2-color))',
                                color: 'var(--surface-color)',
                              }
                            : {
                                backgroundColor: 'var(--surface3-color)',
                                color: 'var(--text-color)',
                                border: '1px solid var(--border-color)',
                              }
                        }
                      >
                        <p>{msg.role === 'bot' ? t(msg.text) : msg.text}</p>
                        {msg.trackId && (
                          <button
                            onClick={() => {
                              const track = tracks.find((t) => t.id === msg.trackId);
                              if (track) playTrack(track);
                            }}
                            className="mt-1.5 text-[11px] underline"
                            style={{ color: 'var(--accent-color)' }}
                          >
                            {'\u25B6 ' + t('Play Track')}
                          </button>
                        )}
                        <span className="block text-[9px] mt-1 opacity-50">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div
                        className="rounded-lg px-2.5 py-2 text-sm flex gap-1"
                        style={{ backgroundColor: 'var(--surface3-color)', border: '1px solid var(--border-color)' }}
                      >
                        <span className="csb-dot" style={{ background: 'var(--accent-color)' }} />
                        <span className="csb-dot" style={{ background: 'var(--accent-color)', animationDelay: '0.15s' }} />
                        <span className="csb-dot" style={{ background: 'var(--accent-color)', animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form
                  onSubmit={handleSubmit}
                  className="px-3 py-2.5 flex gap-1.5 shrink-0"
                  style={{ borderTop: '1px solid var(--border-accent-color)' }}
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t('Type a message...')}
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-[12.5px] outline-none"
                    style={{ backgroundColor: 'var(--surface3-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-40 csb-send"
                    style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent2-color))', color: 'var(--surface-color)' }}
                  >
                    {t('Send')}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
