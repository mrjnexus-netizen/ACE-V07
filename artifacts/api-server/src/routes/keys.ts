import { Router, Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/db'; // Assuming db client is exported from db.ts
import { apiKeys } from '../db/schema';
import { encrypt } from '../services/encryptionService';
import { z } from 'zod';

const router: Router = Router();

// Zod schema for API key creation/update
const apiKeySchema = z.object({
  keyName: z.string().min(1, 'Key name cannot be empty'),
  keyValue: z.string().min(1, 'Key value cannot be empty'),
  isActive: z.boolean().default(false),
});

// Middleware to validate API key schema
const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  try {
    apiKeySchema.parse(req.body);
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      data: null,
      error: error.errors,
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
};

// POST /api/keys - Create or update an API key
router.post(
  '/',
  validateApiKey,
  async (req: Request, res: Response) => {
    try {
      const { keyName, keyValue, isActive } = req.body;
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;

      if (!masterKey) {
        return res.status(500).json({
          success: false,
          data: null,
          error: 'Encryption master key not configured.',
          code: 'ENCRYPTION_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      const existingKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyName, keyName),
      });

      const { encryptedValue, iv, authTag } = encrypt(keyValue, masterKey);

      if (existingKey) {
        // Update existing key
        const [updatedKey] = await db
          .update(apiKeys)
          .set({ encryptedValue, iv, authTag, isActive, updatedAt: new Date() })
          .where(eq(apiKeys.keyName, keyName))
          .returning();
        res.status(200).json({
          success: true,
          data: { id: updatedKey!.id, keyName: updatedKey!.keyName, isActive: updatedKey!.isActive },
          error: null,
          code: null,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Create new key
        const [newKey] = await db
          .insert(apiKeys)
          .values({ keyName, encryptedValue, iv, authTag, isActive })
          .returning();
        res.status(201).json({
          success: true,
          data: { id: newKey!.id, keyName: newKey!.keyName, isActive: newKey!.isActive },
          error: null,
          code: null,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error('Error managing API key:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: error.message || 'Failed to manage API key',
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/keys/status - Get status of all API keys (without revealing values)
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const keys = await db.query.apiKeys.findMany();

    const status = keys.map((key: any) => ({
      id: key.id,
      keyName: key.keyName,
      isActive: key.isActive,
      isConfigured: !!key.encryptedValue, // True if encryptedValue exists
      testedAt: key.testedAt,
    }));

    res.status(200).json({
      success: true,
      data: status,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching API key status:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to fetch API key status',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/keys/test - Test connection for a specific API key (mock implementation)
router.post(
  '/test',
  async (req: Request, res: Response) => {
    try {
      const { keyName, keyValue } = req.body;
      // In a real application, you would make an actual API call to the respective service
      // using keyValue to test the connection.
      // For this mock, we'll just simulate success/failure.

      if (!keyValue || keyValue.length < 10) {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'Invalid API key provided for testing',
          code: 'INVALID_API_KEY',
          timestamp: new Date().toISOString(),
        });
      }

      // Simulate a successful connection test
      // In a real scenario, this would involve calling the actual API of the service
      // e.g., OpenAI, YouTube, etc.

      // Update testedAt timestamp in DB (only if successful)
      await db.update(apiKeys).set({ testedAt: new Date() }).where(eq(apiKeys.keyName, keyName));

      res.status(200).json({
        success: true,
        data: { keyName, status: 'Connected' },
        error: null,
        code: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Error testing API key:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: error.message || 'Failed to test API key',
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
