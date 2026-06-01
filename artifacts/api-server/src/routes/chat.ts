import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import { tracks } from '../db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '../services/encryptionService';

const router: Router = Router();

const getAPIKey = async (keyName: string): Promise<string | null> => {
  try {
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyName, keyName),
    });

    if (!keyRecord || !keyRecord.isActive) {
      return null;
    }

    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) return null;

    return decrypt(
      {
        encryptedValue: keyRecord.encryptedValue,
        iv: keyRecord.iv,
        authTag: keyRecord.authTag,
      },
      masterKey
    );
  } catch {
    return null;
  }
};

import { apiKeys } from '../db/schema';

router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, locale, conversationHistory } = req.body;

    if (!message || !locale) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'message and locale are required fields',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch tracks for the prompt
    const allTracks = await db.query.tracks.findMany();

    const isDemo = process.env.DEMO_MODE === 'true';
    const apiKey = await getAPIKey('LLM_NARRATIVE_API_KEY');

    const systemPrompt = `You are the Executive Studio Manager for a world-class international composer. You speak ${locale} fluently and exclusively. Your tone is professional, cinematic, warm.
Composer portfolio: ${JSON.stringify(allTracks)}
When recommending tracks, include the track ID in a special block like [TRACK:${allTracks[0]?.id || 'track_id'}] or as a structured recommendation.
When asked for a project brief, collect in this order:
  1. Media type (film / game / animation / documentary / commercial)
  2. Emotional direction (3 keywords)
  3. Budget range (below $5k / $5k-$25k / $25k-$100k / above $100k)
  4. Deadline
Then confirm and submit via POST /api/briefs.`;

    if (isDemo || !apiKey) {
      // High-fidelity simulation
      await new Promise((resolve) => setTimeout(resolve, 1500));

      let reply = '';
      const lower = message.toLowerCase();

      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hola') || lower.includes('bonjour') || lower.includes('hey')) {
        reply = locale === 'es'
          ? 'Hola, soy el Gerente Ejecutivo del Estudio. ¿En qué puedo ayudarte hoy en relación al catálogo del compositor o para coordinar un nuevo proyecto?'
          : locale === 'fr'
          ? "Bonjour, je suis le Directeur Exécutif du Studio. Comment puis-je vous aider aujourd'hui concernant le catalogue du compositeur ou pour planifier un projet ?"
          : 'Hello, I am the Executive Studio Manager. How can I assist you today with the composer’s portfolio or project planning?';
      } else if (lower.includes('track') || lower.includes('music') || lower.includes('listen') || lower.includes('song') || lower.includes('recom')) {
        const trackId = allTracks[0]?.id || 'mock-id';
        const title = (allTracks[0]?.title as any)?.en || 'Ascent';
        reply = locale === 'es'
          ? `Te recomiendo escuchar "${title}". Aquí tienes el reproductor integrado para disfrutarlo: [TRACK:${trackId}]`
          : locale === 'fr'
          ? `Je vous recommande d'écouter "${title}". Voici le lecteur intégré pour en profiter : [TRACK:${trackId}]`
          : `I highly recommend listening to "${title}". Here is the inline player for your convenience: [TRACK:${trackId}]`;
      } else if (lower.includes('brief') || lower.includes('hire') || lower.includes('project') || lower.includes('budget') || lower.includes('work')) {
        reply = locale === 'es'
          ? '¡Excelente! Estaré encantado de recopilar los detalles de tu proyecto. En primer lugar, ¿cuál es el tipo de medio (película / juego / animación / documental / comercial)?'
          : locale === 'fr'
          ? "Excellent ! Je serais ravi de recueillir les détails de votre projet. Tout d'abord, quel est le type de média (film / jeu / animation / documentaire / publicité) ?"
          : "Fantastic! I'd be glad to collect details for your custom project. First, what is the media type (film / game / animation / documentary / commercial)?";
      } else {
        reply = locale === 'es'
          ? `He recibido tu mensaje: "${message}". Estaré encantado de ayudarte a explorar nuestro catálogo o recopilar detalles de tu nuevo encargo musical.`
          : locale === 'fr'
          ? `J'ai bien reçu votre message : "${message}". Je serais ravi de vous aider à explorer notre catalogue ou à recueillir les détails de votre projet.`
          : `I received your message: "${message}". I would be delighted to help you explore the composer's portfolio or gather requirements for a new custom music composition.`;
      }

      return res.status(200).json({
        success: true,
        data: { reply },
        error: null,
        code: null,
        timestamp: new Date().toISOString(),
      });
    }

    // Real OpenAI ChatGPT Call
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: message },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
      }),
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;

    return res.status(200).json({
      success: true,
      data: { reply },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to process chat message',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
