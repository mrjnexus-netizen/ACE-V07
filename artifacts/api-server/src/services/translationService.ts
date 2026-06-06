import { eq } from 'drizzle-orm';

import { db } from '../db/db';
import { apiKeys } from '../db/schema';

import { decrypt } from './encryptionService';

export interface MultiLingual {
  en: string;
  es: string;
  fr: string;
  zh: string;
  ja: string;
  ko: string;
}

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
      }
    );
  } catch (error) {
    console.error(`Error retrieving key ${keyName}:`, error);
    return null;
  }
};

export const translateText = async (
  text: string,
  sourceLang: string
): Promise<MultiLingual> => {
  // If demo mode is on or key is not available, return simulated high-fidelity translation
  const isDemo = process.env.DEMO_MODE === 'true';
  const apiKey = await getAPIKey('LLM_NARRATIVE_API_KEY');

  if (isDemo || !apiKey) {
    console.log(`[SIMULATION] Translating: "${text}" from ${sourceLang}`);
    // Simulate dynamic delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      en: sourceLang === 'en' ? text : `[Translated EN] ${text}`,
      es: sourceLang === 'es' ? text : `[Translated ES] ${text}`,
      fr: sourceLang === 'fr' ? text : `[Translated FR] ${text}`,
      zh: sourceLang === 'zh' ? text : `[Translated ZH] ${text}`,
      ja: sourceLang === 'ja' ? text : `[Translated JA] ${text}`,
      ko: sourceLang === 'ko' ? text : `[Translated KO] ${text}`,
    };
  }

  try {
    // Call real OpenAI API using apiKey
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are translating content for an elite international composer's platform. Preserve the dramatic, cinematic, and professional music industry tone. Use native-level grammar for each language. Use music industry terminology appropriate to each market.
Output strict JSON only: { en, es, fr, zh, ja, ko }
No preamble. No markdown. Pure JSON.`,
          },
          {
            role: 'user',
            content: `Source text in ${sourceLang}: "${text}"`,
          },
        ],
      }),
    });

    const data = await response.json();
    const resultText = data.choices[0].message.content;
    return JSON.parse(resultText) as MultiLingual;
  } catch (error) {
    console.error('Real translation failed, falling back to simulation:', error);
    return {
      en: sourceLang === 'en' ? text : `[Fallback EN] ${text}`,
      es: sourceLang === 'es' ? text : `[Fallback ES] ${text}`,
      fr: sourceLang === 'fr' ? text : `[Fallback FR] ${text}`,
      zh: sourceLang === 'zh' ? text : `[Fallback ZH] ${text}`,
      ja: sourceLang === 'ja' ? text : `[Fallback JA] ${text}`,
      ko: sourceLang === 'ko' ? text : `[Fallback KO] ${text}`,
    };
  }
};
