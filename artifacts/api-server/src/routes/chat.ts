import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import { apiKeys, tracks } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import OpenAI from 'openai';

const router: Router = Router();

const SYSTEM_PROMPT = `You are an AI assistant designed to help users find suitable audio tracks.
When a user describes their needs, provide a track recommendation from the available tracks if appropriate.
If no tracks are explicitly provided, use your general knowledge to suggest a genre or mood.
Always be helpful and concise.`;

// POST /api/chat - Public endpoint for LLM interaction
router.post(
  '/',
  async (req: Request, res: Response) => {
    try {
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'Message is required',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      // Load LLM key from DB at runtime
      const openAIKeyRecord = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyName, 'openai_api_key'),
      });

      if (!openAIKeyRecord || !openAIKeyRecord.encryptedValue) {
        return res.status(500).json({
          success: false,
          data: null,
          error: 'OpenAI API key not configured',
          code: 'SERVER_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      // Decrypt the key (simplified for example, use proper encryption in production)
      const OPENAI_API_KEY = openAIKeyRecord.encryptedValue; // Assume decrypted value

      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

      // Include tracks context (example: top 5 tracks)
      const availableTracks = await db.query.tracks.findMany({
        where: eq(tracks.isLive, true),
        orderBy: [sql`random()`],
        limit: 5,
      });

      const tracksContext = availableTracks.map(t => `ID: ${t.id}, Title: ${(t.title as any)?.en || ''}, Genre: ${t.genre}, Mood: ${t.mood}`).join('\n');

      const completion = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Available Tracks:\n${tracksContext}\n\nUser Request: ${message}` },
        ],
        model: 'gpt-4o',
      });

      const reply = completion.choices[0]!.message.content || 'No response from AI.';

      // Simple heuristic for track recommendation (can be improved)
      let trackRecommendationId: string | undefined;
      for (const track of availableTracks) {
        const titleEn = (track.title as any)?.en;
        if (titleEn && reply.includes(titleEn)) {
          trackRecommendationId = track.id;
          break;
        }
      }

      return res.status(200).json({
        success: true,
        data: { reply, trackRecommendation: trackRecommendationId },
        error: null,
        code: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Error in chat endpoint:', error);
      return res.status(500).json({
        success: false,
        data: null,
        error: error.message || 'Failed to get AI response',
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
