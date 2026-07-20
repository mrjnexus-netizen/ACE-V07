import { Router, Request, Response } from 'express';

import { authGuard } from '../middleware/auth';
import { getModelUpdateAlerts, refreshModelUpdates, dismissModelUpdateAlert, removeModelFromAlert, applyAllModelUpdates, markSeen } from '../services/modelDiscovery';
import { applyModelOverride, persistModelOverride, findTextProvider, findImageProvider } from '../services/aiProviders';

const router = Router();

// GET /api/model-updates — current alert list (checked automatically every
// 24h in the background, and once per admin login; this just reads
// whatever was last found).
router.get('/', authGuard, (_req: Request, res: Response): void => {
  const result = getModelUpdateAlerts();
  res.status(200).json({ success: true, data: result, error: null, code: null, timestamp: new Date().toISOString() });
});

// POST /api/model-updates/refresh — manual "Check Now", runs immediately.
router.post('/refresh', authGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await refreshModelUpdates();
    res.status(200).json({ success: true, data: { alerts }, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Model discovery check failed',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/model-updates/apply-all — 2026-07-19 (per Reza): one button,
// applies every currently-alerted new model AND strips every currently-
// alerted removed model, across every provider, in one shot. Nothing
// per-model to click through.
router.post('/apply-all', authGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await applyAllModelUpdates();
    res.status(200).json({ success: true, data: { alerts }, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to apply model updates',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/model-updates/seen — 2026-07-19 (per Reza): clears the NEW
// badge for one model, called when the admin selects it in the
// Gatekeeper Hub picker.
router.post('/seen', authGuard, async (req: Request, res: Response): Promise<void> => {
  const kind = req.body?.kind as 'text' | 'image' | undefined;
  const providerId = req.body?.providerId as string | undefined;
  const modelId = req.body?.modelId as string | undefined;
  if (!kind || !providerId || !modelId) {
    res.status(400).json({ success: false, data: null, error: 'kind, providerId and modelId are required', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
    return;
  }
  await markSeen(kind, providerId, modelId);
  res.status(200).json({ success: true, data: null, error: null, code: null, timestamp: new Date().toISOString() });
});

// POST /api/model-updates/:providerId/apply — adds ONE model into the
// provider's selectable list (visible immediately in the model dropdown),
// then removes just that model from the alert. Kept alongside apply-all
// for single-model corrections.
router.post('/:providerId/apply', authGuard, async (req: Request, res: Response): Promise<void> => {
  const providerId = req.params.providerId!;
  const modelId = req.body?.modelId as string | undefined;
  if (!modelId) {
    res.status(400).json({ success: false, data: null, error: 'modelId is required', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
    return;
  }
  const textProvider = findTextProvider(providerId);
  const imageProvider = findImageProvider(providerId);
  const kind = textProvider ? 'text' : imageProvider ? 'image' : null;
  if (!kind) {
    res.status(404).json({ success: false, data: null, error: 'Provider not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
    return;
  }
  const applied = applyModelOverride(kind, providerId, modelId, modelId, true);
  if (!applied) {
    res.status(500).json({ success: false, data: null, error: 'Failed to apply model', code: 'SERVER_ERROR', timestamp: new Date().toISOString() });
    return;
  }
  // 2026-07-10 fix: applyModelOverride() above only updates the in-memory
  // registry (lost on restart) — persistModelOverride() writes the durable
  // record hydrateModelOverrides() replays at next boot. A failure here is
  // logged but does not fail the request: the model is already live for
  // this running process, which is what the admin clicking "Apply" wanted;
  // worst case it needs a re-click after a restart.
  try {
    await persistModelOverride(kind, providerId, modelId, modelId, true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[modelOverrides] Applied "${modelId}" live but failed to persist it — will not survive a restart.`, err);
  }
  removeModelFromAlert(providerId, modelId);
  res.status(200).json({ success: true, data: getModelUpdateAlerts(), error: null, code: null, timestamp: new Date().toISOString() });
});

// POST /api/model-updates/:providerId/dismiss — admin acknowledges an alert.
router.post('/:providerId/dismiss', authGuard, (req: Request, res: Response): void => {
  dismissModelUpdateAlert(req.params.providerId!);
  res.status(200).json({ success: true, data: getModelUpdateAlerts(), error: null, code: null, timestamp: new Date().toISOString() });
});

export default router;
