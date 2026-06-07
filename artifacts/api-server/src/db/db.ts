import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

// We will define this AppError later, for now, we will use a generic Error.
// import { AppError } from '../utils/errors';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });

export async function connectDb(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    console.log('Database connection verified.');
  } catch (error) {
    console.error('Database connection failed:', error);
    // In a real application, you would throw a structured AppError here.
    throw new Error('Database connection failed');
  }
}
