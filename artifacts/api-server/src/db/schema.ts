import { pgTable, uuid, jsonb, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const composerIdentity = pgTable(
  'composer_identity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: jsonb('name').notNull().default({}),
    tagline: jsonb('tagline').notNull().default({}),
    biography: jsonb('biography').notNull().default({}),
    awards: jsonb('awards').notNull().default([]).array(),
    studioAddress: jsonb('studio_address').notNull().default({}),
    portraitUrl: text('portrait_url'),
    portraitBlur: text('portrait_blur'),
    logoUrl: text('logo_url'),
    heroVideoUrl: text('hero_video_url'),
    socialLinks: jsonb('social_links').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  }
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    composerId: uuid('composer_id').references(() => composerIdentity.id, { onDelete: 'cascade' }),
    title: jsonb('title').notNull().default({}),
    type: text('type').notNull(),
    year: integer('year'),
    description: jsonb('description').notNull().default({}),
    coverUrl: text('cover_url'),
    coverBlur: text('cover_blur'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  }
);

export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: jsonb('title').notNull().default({}),
    narrative: jsonb('narrative').notNull().default({}),
    audioUrl: text('audio_url'),
    coverUrl: text('cover_url'),
    coverBlur: text('cover_blur'),
    dominantColors: text('dominant_colors').array().default([]),
    vibrantPalette: jsonb('vibrant_palette'),
    genre: text('genre'),
    bpm: integer('bpm'),
    mood: text('mood'),
    keySignature: text('key_signature'),
    duration: integer('duration'),
    sortOrder: integer('sort_order').notNull().default(0),
    isLive: boolean('is_live').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  }
);

export const pipelineJobs = pgTable(
  'pipeline_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    trackId: uuid('track_id').references(() => tracks.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('idle'),
    progress: integer('progress').default(0),
    audioMetadata: jsonb('audio_metadata'),
    generatedArtUrl: text('generated_art_url'),
    generatedNarrative: jsonb('generated_narrative'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  }
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    keyName: text('key_name').unique().notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    isActive: boolean('is_active').default(false),
    testedAt: timestamp('tested_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  }
);

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: text('username').unique().notNull(),
    passwordHash: text('password_hash').notNull(),
    failedAttempts: integer('failed_attempts').default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLogin: timestamp('last_login', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  }
);

export const briefs = pgTable(
  'briefs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    locale: text('locale').notNull(),
    budgetRange: text('budget_range'),
    mediaType: text('media_type'),
    deadline: text('deadline'),
    emotionalDirection: text('emotional_direction'),
    rawConversation: jsonb('raw_conversation').notNull().default({}),
    isRead: boolean('is_read').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  }
);

export const stagingDrafts = pgTable(
  'staging_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    draftData: jsonb('draft_data').notNull().default({}),
    createdBy: uuid('created_by').references(() => adminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  }
);

// Relations
export const composerIdentityRelations = relations(composerIdentity, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  composer: one(composerIdentity, { fields: [projects.composerId], references: [composerIdentity.id] }),
}));

export const tracksRelations = relations(tracks, ({ many }) => ({
  pipelineJobs: many(pipelineJobs),
}));

export const pipelineJobsRelations = relations(pipelineJobs, ({ one }) => ({
  track: one(tracks, { fields: [pipelineJobs.trackId], references: [tracks.id] }),
}));

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  stagingDrafts: many(stagingDrafts),
}));

export const stagingDraftsRelations = relations(stagingDrafts, ({ one }) => ({
  adminUser: one(adminUsers, { fields: [stagingDrafts.createdBy], references: [adminUsers.id] }),
}));
