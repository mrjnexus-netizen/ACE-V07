import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { apiPost } from '../lib/apiClient';

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

export default function ExecutiveStudioBot() {
  const { locale, tracks } = useIdentity();
  const { playTrack } = useAudio();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: "Hello! I'm the ACE Studio Manager. How can I assist you today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [collectingBrief, setCollectingBrief] = useState(false);
  const [briefData, setBriefData] = useState<string[]>([]);
  const [briefStep, setBriefStep] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const safeLocale = locale ?? 'en';

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
        const data = await apiPost<ChatApiResponse | null>('/api/chat', { message: text, history });
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
    [isLoading, messages],
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

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg z-50 hover:scale-105 active:scale-95 transition-all"
        style={{ backgroundColor: 'var(--accent-color)', color: 'var(--surface-color)' }}
        aria-label="Studio Bot"
      >
        {'\uD83D\uDCAC'}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-32 right-6 w-[380px] max-w-[90vw] h-[520px] rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden border"
            style={{
              background: 'rgba(var(--surface-rgb), 0.85)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
              <span className="font-mono text-sm" style={{ color: 'var(--text-color)' }}>Studio Bot</span>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="text-[var(--text-muted-color)] hover:text-[var(--accent-color)]"
              >
                {'\u2715'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[80%] rounded-lg p-3 text-sm whitespace-pre-line"
                    style={
                      msg.role === 'user'
                        ? { backgroundColor: 'var(--accent-color)', color: 'var(--surface-color)' }
                        : { backgroundColor: 'var(--surface3-color)', color: 'var(--text-color)' }
                    }
                  >
                    <p>{msg.text}</p>
                    {msg.trackId && (
                      <button
                        onClick={() => {
                          const track = tracks.find((t) => t.id === msg.trackId);
                          if (track) playTrack(track);
                        }}
                        className="mt-2 text-xs underline"
                        style={{ color: 'var(--accent-color)' }}
                      >
                        {'\u25B6 Play Track'}
                      </button>
                    )}
                    <span className="block text-[10px] mt-1 opacity-50">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg p-3 text-sm flex gap-1" style={{ backgroundColor: 'var(--surface3-color)' }}>
                    <span className="animate-bounce">{'\u2022'}</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>{'\u2022'}</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>{'\u2022'}</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2" style={{ borderColor: 'var(--border-color)' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--surface3-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--surface-color)' }}
              >
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}