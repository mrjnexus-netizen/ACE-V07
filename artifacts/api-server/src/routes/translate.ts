import { Router } from 'express';

import { translateUI, translateUIBatch, isSupportedLang } from '../services/uiTranslator';

const router = Router();

/**
 * POST /api/translate
 *
 * Body (single):  { text: string, targetLang: string }
 *   -> { translation: string }
 *
 * Body (batch):   { texts: string[], targetLang: string }
 *   -> { translations: string[] }
 *
 * The Gemini key lives only on the server; the client never sees it.
 */
router.post('/', async (req, res) => {
  const { text, texts, targetLang } = req.body ?? {};

  if (typeof targetLang !== 'string' || !isSupportedLang(targetLang)) {
    return res.status(400).json({ error: 'Invalid or missing targetLang' });
  }

  // Batch mode
  if (Array.isArray(texts)) {
    if (texts.length > 200) {
      return res.status(400).json({ error: 'Too many texts (max 200)' });
    }
    if (!texts.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: 'All texts must be strings' });
    }
    const translations = await translateUIBatch(texts, targetLang);
    return res.json({ translations });
  }

  // Single mode
  if (typeof text === 'string') {
    if (text.length > 5000) {
      return res.status(400).json({ error: 'Text too long (max 5000 chars)' });
    }
    const translation = await translateUI(text, targetLang);
    return res.json({ translation });
  }

  return res.status(400).json({ error: 'Provide either "text" (string) or "texts" (string[])' });
});

export default router;
