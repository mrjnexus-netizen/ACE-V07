import { pgTable, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export type Multilingual = {
  en: string; es: string; fr: string; zh: string; ja: string; ko: string;
};

// 1. Composer Identity Table
export const composer_identity = pgTable('composer_identity', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: jsonb('name').$type<Multilingual>().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Tracks Table
export const tracks = pgTable('tracks', {
  id: uuid('id').defaultRandom().primaryKey(),
  composer_id: uuid('composer_id').references(() => composer_identity.id),
  title: jsonb('title').$type<Multilingual>().notNull(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  composerIdx: index('composer_idx').on(table.composer_id),
}));