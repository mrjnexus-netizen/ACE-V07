import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { apiPost } from '../lib/apiClient';
import type { AudioTrack } from '../types';

interface ChatMessage {
  role: 'bot' | 'user';
  text: string;
  trackId?: string;
  timestamp: string;
}

const BOT_SYSTEM_PROMPT = `You are the Executive Studio Manager for a world-class international composer.
You speak {locale} fluently and exclusively. Your tone is professional, cinematic, warm.
When recommending tracks, include the track ID for inline player.
When asked for a project brief, collect in this order:
1. Media type (film / game / animation / documentary / commercial)
2. Emotional direction (3 keywords)
3. Budget range (below $5k / $5k-$25k / $25k-$100k / above $100k)
4. Deadline
Then confirm and submit via POST /api/briefs.`;

const BRIEF_QUESTIONS = [
  "What type of media? (film / game / animation / documentary / commercial)",
  "What emotional direction? (3 keywords)",
  "What's your budget range? (below $5k / $5k-$25k / $25k-$100k / above $100k)",
  "When's your deadline?"
];

export default function ExecutiveStudioBot() {
  const { locale, tracks } = useIdentity();
  const { audioState, playTrack } = useAudio();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'bot',
    text: `Hello! I'm the ACE Studio Manager. How can I assist you today?`,
    timestamp: new Date().toISOString()
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [collectingBrief, setCollectingBrief] = useState(false);
  const [briefData, setBriefData] = useState<string[]>([]);
  const [briefStep, setBriefStep] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Simulate AI response (real implementation calls POST /api/chat)
      const botResponse = generateBotResponse(text, tracks, locale);
      setMessages(prev => [...prev, botResponse]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: "I apologize, I'm having trouble connecting. Please try again.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, tracks, locale]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (collectingBrief) {
      handleBriefCollection(input);
    } else if (input.toLowerCase().includes('brief') || input.toLowerCase().includes('project')) {
      setCollectingBrief(true);
      setBriefStep(0);
      setBriefData([]);
      const firstQuestion = BRIEF_QUESTIONS[0]!;
      setMessages(prev => [...prev, { role: 'bot', text: firstQuestion, timestamp: new Date().toISOString() }]);
      setInput('');
    } else {
      sendMessage(input);
    }
  };

  const handleBriefCollection = (answer: string) => {
    const newBriefData = [...briefData, answer];
    setBriefData(newBriefData);
    
    if (briefStep < BRIEF_QUESTIONS.length - 1) {
      const nextStep = briefStep + 1;
      setBriefStep(nextStep);
      setMessages(prev => [...prev, 
        { role: 'user', text: answer, timestamp: new Date().toISOString() },
        { role: 'bot', text: BRIEF_QUESTIONS[nextStep]!, timestamp: new Date().toISOString() }
      ]);
    } else {
      setCollectingBrief(false);
      setBriefStep(0);
      setBriefData([]);
      const confirmation = `Brief submitted!\nType: ${newBriefData[0]}\nDirection: ${newBriefData[1]}\nBudget: ${newBriefData[2]}\nDeadline: ${newBriefData[3]}`;
      setMessages(prev => [...prev,
        { role: 'user', text: answer, timestamp: new Date().toISOString() },
        { role: 'bot', text: confirmation, timestamp: new Date().toISOString() }
      ]);
    }
    setInput('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg z-50 hover:scale-105 active:scale-95 transition-all"
        style={{ backgroundColor: 'var(--accent-color)', color: 'var(--surface-color)' }}
        aria-label="Studio Bot"
      >
        ??
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
              borderColor: 'var(--border-color)'
            }}
          >
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
              <span className="font-mono text-sm" style={{ color: 'var(--text-color)' }}>Studio Bot</span>
              <button onClick={() => setIsOpen(false)} className="text-[var(--text-muted-color)] hover:text-[var(--accent-color)]">?</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-lg p-3 text-sm ${
                      msg.role === 'user'
                        ? 'text-white'
                        : ''
                    }`}
                    style={msg.role === 'user'
                      ? { backgroundColor: 'var(--accent-color)', color: 'var(--surface-color)' }
                      : { backgroundColor: 'var(--surface3-color)', color: 'var(--text-color)' }
                    }
                  >
                    <p>{msg.text}</p>
                    {msg.trackId && (
                      <button
                        onClick={() => {
                          const track = tracks.find(t => t.id === msg.trackId);
                          if (track) playTrack(track);
                        }}
                        className="mt-2 text-xs underline"
                        style={{ color: 'var(--accent-color)' }}
                      >
                        ? Play Track
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
                    <span className="animate-bounce">?</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>?</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>?</span>
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
                style={{
                  backgroundColor: 'var(--surface3-color)',
                  color: 'var(--text-color)',
                  border: '1px solid var(--border-color)'
                }}
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

// Simple response generator (replaces actual LLM API call)
function generateBotResponse(text: string, tracks: AudioTrack[], locale: string): ChatMessage {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('track') || lowerText.includes('music') || lowerText.includes('play')) {
    if (tracks.length > 0) {
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)]!;
      const title = randomTrack.title?.[locale as keyof typeof randomTrack.title] || randomTrack.title?.en || 'this track';
      return {
        role: 'bot',
        text: `I recommend "${title}". You can listen to it directly here.`,
        trackId: randomTrack.id,
        timestamp: new Date().toISOString()
      };
    }
    return {
      role: 'bot',
      text: "No tracks are available yet. Please check back later.",
      timestamp: new Date().toISOString()
    };
  }

  if (lowerText.includes('brief') || lowerText.includes('project')) {
    return {
      role: 'bot',
      text: "I'd be happy to help you create a project brief! Let me ask you a few questions.",
      timestamp: new Date().toISOString()
    };
  }

  const responses = [
    "I'd be happy to assist you with that.",
    "Let me know how I can help with your project.",
    "Feel free to ask about our tracks or submit a project brief!",
    "I'm here to help with any questions about ACE's portfolio."
  ];
  const randomResponse = responses[Math.floor(Math.random() * responses.length)]!;

  return {
    role: 'bot',
    text: randomResponse,
    timestamp: new Date().toISOString()
  };
}