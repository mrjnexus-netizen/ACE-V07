import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Router, Request, Response } from 'express';
import multer from 'multer';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

import { authGuard } from '../middleware/auth';

const router: Router = Router();

// Site branding files (favicon.ico, favicon.svg, apple-touch-icon.png,
// og-image.jpg) are referenced by index.html via plain root-relative paths
// (e.g. "/favicon.ico") because they're static assets served directly out
// of the frontend's public/ folder -- NOT S3-hosted media like tracks or
// posters. They must physically exist on disk at that path, so this route
// writes straight into artifacts/ace-2026/public/ instead of uploading to
// S3. `pnpm -r --parallel run dev` (and the built `dist/index.js`) both run
// with cwd = the api-server package directory, so resolving relative to
// process.cwd() is the one path calculation that stays correct in both dev
// (tsx) and production (esbuild bundle) -- unlike a __dirname-based guess,
// which would break once bundled into dist/. SITE_PUBLIC_DIR is available
// as an escape hatch if the monorepo is ever laid out differently.
const FRONTEND_PUBLIC_DIR = process.env.SITE_PUBLIC_DIR
  ? path.resolve(process.env.SITE_PUBLIC_DIR)
  : path.resolve(process.cwd(), '../ace-2026/public');

const FILES = {
  favicon: 'favicon.ico',
  faviconSvg: 'favicon.svg',
  appleTouchIcon: 'apple-touch-icon.png',
  ogImage: 'og-image.jpg',
} as const;

// The site's own dark theme color (matches <meta name="theme-color"> in
// index.html) -- used to flatten any transparency in the uploaded source
// image rather than leaving alpha, which iOS/social platforms render
// inconsistently (some fill transparent regions white, some black).
const BRAND_BACKGROUND = '#080808';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      (cb as (err: Error | null, accept: boolean) => void)(
        new Error('Only JPEG, PNG, or WEBP images are allowed.'),
        false,
      );
    }
  },
});

async function ensurePublicDir(): Promise<void> {
  await fs.mkdir(FRONTEND_PUBLIC_DIR, { recursive: true });
}

async function fileInfo(name: string): Promise<{ exists: boolean; updatedAt: string | null }> {
  try {
    const stat = await fs.stat(path.join(FRONTEND_PUBLIC_DIR, name));
    return { exists: true, updatedAt: stat.mtime.toISOString() };
  } catch {
    return { exists: false, updatedAt: null };
  }
}

// Generates favicon.ico (multi-size), a raster-wrapped favicon.svg (a real
// vector re-draw isn't possible from a photo/logo raster, so this embeds
// the PNG inside a minimal SVG wrapper -- valid, renders correctly as a tab
// icon in every modern browser, just not infinitely scalable art), and
// apple-touch-icon.png from one square-ish source image.
async function generateIconFiles(buffer: Buffer): Promise<void> {
  const png32 = await sharp(buffer).resize(32, 32, { fit: 'cover' }).png().toBuffer();
  const png16 = await sharp(buffer).resize(16, 16, { fit: 'cover' }).png().toBuffer();
  const icoBuffer = await pngToIco([png32, png16]);

  const applePng = await sharp(buffer)
    .resize(180, 180, { fit: 'cover' })
    .flatten({ background: BRAND_BACKGROUND })
    .png()
    .toBuffer();

  const svgPng = await sharp(buffer).resize(64, 64, { fit: 'cover' }).png().toBuffer();
  const svgContent =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<image width="64" height="64" href="data:image/png;base64,${svgPng.toString('base64')}"/></svg>`;

  await ensurePublicDir();
  await fs.writeFile(path.join(FRONTEND_PUBLIC_DIR, FILES.favicon), icoBuffer);
  await fs.writeFile(path.join(FRONTEND_PUBLIC_DIR, FILES.faviconSvg), svgContent, 'utf8');
  await fs.writeFile(path.join(FRONTEND_PUBLIC_DIR, FILES.appleTouchIcon), applePng);
}

// Generates og-image.jpg (1200x630, the standard safe size for WhatsApp /
// Twitter / Facebook / LinkedIn / Slack link previews). Uses sharp's
// "attention" crop strategy -- libvips picks the highest-entropy region of
// the source rather than a naive center crop, so a portrait with the
// subject off-center still gets framed sensibly.
async function generateOgImage(buffer: Buffer): Promise<void> {
  const jpeg = await sharp(buffer)
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .flatten({ background: BRAND_BACKGROUND })
    .jpeg({ quality: 90 })
    .toBuffer();

  await ensurePublicDir();
  await fs.writeFile(path.join(FRONTEND_PUBLIC_DIR, FILES.ogImage), jpeg);
}

router.get('/status', authGuard, async (_req: Request, res: Response) => {
  try {
    const [favicon, faviconSvg, appleTouchIcon, ogImage] = await Promise.all([
      fileInfo(FILES.favicon),
      fileInfo(FILES.faviconSvg),
      fileInfo(FILES.appleTouchIcon),
      fileInfo(FILES.ogImage),
    ]);
    return res.status(200).json({
      success: true,
      data: { favicon, faviconSvg, appleTouchIcon, ogImage },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to read site identity status',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// The "icon" upload: a square-ish logo or portrait. Produces the favicon
// family. Also fills og-image.jpg as a fallback IF one doesn't already
// exist yet, so a fresh install never ends up with a missing preview image
// just because the admin only ever used this one upload slot.
router.post('/icon', authGuard, upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No image uploaded',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
    await generateIconFiles(req.file.buffer);

    const ogExists = (await fileInfo(FILES.ogImage)).exists;
    if (!ogExists) {
      await generateOgImage(req.file.buffer);
    }

    return res.status(200).json({
      success: true,
      data: { generated: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', ...(!ogExists ? ['og-image.jpg'] : [])] },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Error generating site icon files:', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to generate icon files',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// The "social" upload: an optional, separate wide/landscape-friendly image
// specifically for link previews -- lets the admin use a different, more
// cinematic shot for the WhatsApp/Twitter card than the small square used
// for the browser-tab favicon.
router.post('/social', authGuard, upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No image uploaded',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
    await generateOgImage(req.file.buffer);
    return res.status(200).json({
      success: true,
      data: { generated: ['og-image.jpg'] },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Error generating og-image:', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to generate the preview image',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
