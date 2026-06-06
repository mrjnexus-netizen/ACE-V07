import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentity } from '../context/IdentityContext';
import { useAudio } from '../context/AudioContext';
import { useMediaQuery } from '../hooks/useMediaQuery'; // Assuming this hook exists for mobile detection

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  recommendation?: string; // trackId
}

const SYSTEM_PROMPT_TEMPLATE = (locale: string, tracks: any[]) => `You are the Executive Studio Manager for a world-class international composer. You speak ${locale} fluently and exclusively. Your tone is professional, cinematic, warm.
Composer portfolio: ${JSON.stringify(tracks)}
When recommending tracks, include the track ID for inline player.
When asked for a project brief, collect in this order:
1. Media type (film / game / animation / documentary / commercial)
2. Emotional direction (3 keywords)
3. Budget range (below $5k / $5k-$25k / $25k-$100k / above $100k)
4. Deadline
Then confirm and submit via POST /api/briefs.`;

const ExecutiveStudioBot = () => {
  const { locale, identity, playlist } = useIdentity();
  const { audioState, playTrack } = useAudio();
  const isMobile = useMediaQuery('(max-width: 767px)'); // Custom hook to detect mobile

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: locale === 'es'
        ? 'Hola, soy el Gerente Ejecutivo del Estudio. ¿En qué puedo ayudarte hoy en relación al catálogo del compositor o para coordinar un nuevo proyecto?'
        : locale === 'fr'
        ? "Bonjour, je suis le Directeur Exécutif du Studio. Comment puis-je vous aider aujourd'hui concernant le catalogue du compositeur ou pour planifier un projet ?"
        : 'Hello! I am the Executive Studio Manager. I am here to help you explore our music portfolio or collect specifications for a custom scoring project. How can I assist you today?',
    },
  ]);

  const [briefStep, setBriefStep] = useState<number>(0);
  const [briefData, setBriefData] = useState<any>({
    mediaType: '',
    emotionalDirection: '',
    budgetRange: '',
    deadline: '',
  });

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: input,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Brief collection state machine
    if (briefStep > 0) {
      handleBriefStep(input);
      return;
    }

    // Standard AI chat response
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          locale,
          systemPrompt: SYSTEM_PROMPT_TEMPLATE(locale, playlist),
          conversationHistory: messages.map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
        }),
      });

      const resData = await response.json();
      if (resData.success) {
        const reply = resData.data.reply;

        // Parse recommendation e.g. [TRACK:track_id]
        const trackMatch = reply.match(/\[TRACK:([^\]]+)\]/);
        const cleanText = reply.replace(/\[TRACK:[^\]]+\]/, '').trim();

        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-bot`,
            sender: 'bot',
            text: cleanText,
            recommendation: trackMatch ? trackMatch[1] : undefined,
          },
        ]);

        // If bot suggests project brief collection, trigger brief steps
        if (input.toLowerCase().includes('brief') || input.toLowerCase().includes('hire') || input.toLowerCase().includes('project')) {
          setBriefStep(1);
          setMessages(prev => [...prev, {
            id: `brief-start-${Date.now()}`,
            sender: 'bot',
            text: locale === 'es'
              ? '¡Excelente! Para empezar un nuevo proyecto, ¿cuál es el tipo de medio? (Película / Juego / Animación / Documental / Comercial)'
              : locale === 'fr'
              ? 'Super ! Pour lancer un nouveau projet, quel est le type de média ? (Film / Jeu / Animation / Documentaire / Publicité)'
              : 'Excellent! To start a new project brief, what is the media type? (Film / Game / Animation / Documentary / Commercial)',
          }]);
        }

      } else {
        console.error('API Error:', resData.error);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          sender: 'bot',
          text: 'I apologize, but I encountered an error. Please try again later.',
        }]);
      }
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        sender: 'bot',
        text: 'I am currently offline. Please try again later.',
      }]);
    }
  };

  const handleBriefStep = async (val: string) => {
    let nextStep = briefStep;
    const currentData = { ...briefData };

    if (briefStep === 1) {
      currentData.mediaType = val;
      nextStep = 2;
      setMessages((prev) => [
        ...prev,
        {
          id: `brief-${Date.now()}`,
          sender: 'bot',
          text: locale === 'es'
            ? 'Entendido. Segundo, ¿cuál es la dirección emocional del proyecto? (Escribe 3 palabras clave)'
            : locale === 'fr'
            ? 'Compris. Ensuite, quelle est la direction émotionnelle de la partition ? (Veuillez fournir 3 mots-clés)'
            : 'Got it. Second, what is the emotional direction for the score? (Please provide 3 keywords)',
        },
      ]);
    } else if (briefStep === 2) {
      currentData.emotionalDirection = val;
      nextStep = 3;
      setMessages((prev) => [
        ...prev,
        {
          id: `brief-${Date.now()}`,
          sender: 'bot',
          text: locale === 'es'
            ? 'Tercero, ¿cuál es tu rango de presupuesto? (ej. menos de $5k / $5k-$25k / $25k-$100k / más de $100k)'
            : locale === 'fr'
            ? 'Troisièmement, quelle est votre fourchette de budget ? (ex. moins de 5k$ / 5k$-25k$ / 25k$-100k$ / plus de 100k$)'
            : 'Third, what is your budget range? (e.g. below $5k / $5k-$25k / $25k-$100k / above $100k)',
        },
      ]);
    } else if (briefStep === 3) {
      currentData.budgetRange = val;
      nextStep = 4;
      setMessages((prev) => [
        ...prev,
        {
          id: `brief-${Date.now()}`,
          sender: 'bot',
          text: locale === 'es'
            ? 'Cuarto, ¿cuál es la fecha límite final o fecha de entrega para las composiciones completas?'
            : locale === 'fr'
            ? 'Quatrièmement, quelle est la date limite finale ou la date de livraison pour les compositions terminées ?'
            : 'Fourth, what is the final deadline or delivery date for the completed compositions?',
        },
      ]);
    } else if (briefStep === 4) {
      currentData.deadline = val;
      nextStep = 0; // Completed!

      // Submit POST to briefs
      try {
        await fetch('/api/briefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locale,
            budgetRange: currentData.budgetRange,
            mediaType: currentData.mediaType,
            deadline: currentData.deadline,
            emotionalDirection: currentData.emotionalDirection,
            rawConversation: currentData,
          }),
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `brief-success-${Date.now()}`,
            sender: 'bot',
            text: locale === 'es'
              ? '¡Muchas gracias! Tu informe de proyecto ha sido enviado con éxito al estudio del compositor. Nos pondremos en contacto contigo pronto.'
              : locale === 'fr'
              ? 'Merci beaucoup ! Vos spécifications de projet ont été enregistrées en toute sécurité et soumises au compositeur. Notre équipe vous contactera sous peu.'
              : 'Thank you very much! Your project specifications have been securely recorded and submitted to the composer. Our team will contact you shortly.',
          },
        ]);
      } catch (err) {
        console.error('Failed to submit brief:', err);
        setMessages(prev => [...prev, {
          id: `brief-error-${Date.now()}`,
          sender: 'bot',
          text: 'There was an error submitting your brief. Please try again later.',
        }]);
      }
    }

    setBriefData(currentData);
    setBriefStep(nextStep);
  };

  const playRecommendTrack = (trackId: string) => {
    const track = audioState.playlist.find((t) => t.id === trackId);
    if (track) {
      playTrack(track);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-[88px] right-[24px] w-14 h-14 rounded-full bg-accent text-surface-color flex items-center justify-center shadow-2xl z-[9998] hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer outline-none"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </motion.button>

      {/* Chat Window Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: isMobile ? '70vh' : 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isMobile ? '70vh' : 50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              backdropFilter: 'blur(30px) saturate(180%) brightness(0.85)',
              WebkitBackdropFilter: 'blur(30px) saturate(180%) brightness(0.85)',
              background: 'rgba(var(--surface-rgb), 0.75)',
            }}
            className={`fixed ${isMobile ? 'inset-x-0 bottom-0 h-[70vh] rounded-t-2xl' : 'bottom-[160px] right-[24px] w-[380px] h-[520px] rounded-2xl'} border border-border flex flex-col overflow-hidden shadow-2xl z-[9998]`}
          >
            {/* Header */}
            <div className="p-4 border-b border-border bg-surface4 flex justify-between items-center">
              <div>
                <h4 className="font-display font-bold text-text text-sm tracking-wide">Studio Executive</h4>
                <p className="font-mono text-[9px] text-accent tracking-widest uppercase">Connected & Online</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>

            {/* Messages Display */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    style={{
                      backgroundColor: m.sender === 'user' ? 'var(--accent-color)' : 'rgba(var(--surface-rgb), 0.5)',
                      color: m.sender === 'user' ? 'var(--surface-color)' : 'var(--text-color)',
                    }}
                    className={`max-w-[85%] p-3 rounded-xl border border-border text-xs leading-relaxed ${m.sender === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'}`}
                  >
                    <p>{m.text}</p>

                    {/* Recommendation Inline Mini Player */}
                    {m.recommendation && (
                      <div className="mt-3 p-2 bg-surface4 border border-border rounded flex items-center justify-between">
                        <span className="font-mono text-[9px] text-text-muted">RECOMMENDED COMPOSITION</span>
                        <button
                          onClick={() => playRecommendTrack(m.recommendation!)}
                          className="px-2.5 py-1 bg-accent text-surface-color text-[10px] font-mono rounded hover:scale-105 active:scale-95 transition-transform"
                        >
                          {audioState.isPlaying && audioState.currentTrack?.id === m.recommendation ? 'PAUSE' : 'PLAY'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 border-t border-border bg-surface4 flex items-center space-x-2">
              <input
                type="text"
                placeholder={locale === 'es' ? 'Escribe un mensaje...' : locale === 'fr' ? 'Écrivez un message...' : 'Type a message...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-xs text-text placeholder-text-dim focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSend}
                className="w-8 h-8 rounded-lg bg-accent text-surface-color flex items-center justify-center hover:scale-105 active:scale-95 transition-transform outline-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 fill-current transform rotate-90" viewBox="0 0 24 24">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ExecutiveStudioBot; 