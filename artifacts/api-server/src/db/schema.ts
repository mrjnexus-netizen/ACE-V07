import { relations } from 'drizzle-orm';
import { pgTable, uuid, jsonb, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const composerIdentity = pgTable(
  'composer_identity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: jsonb('name').notNull().default({}),
    tagline: jsonb('tagline').notNull().default({}),
    biography: jsonb('biography').notNull().default({}),
    awards: jsonb('awards').array().notNull().default([]),
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
  },
  (table) => ({
    composerIdIdx: index('idx_projects_composer_id').on(table.composerId),
  })
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
    // Which Selected-Works concept this track belongs to (e.g. "Cinema",
    // "Games"). Admin picks one on upload. Null until assigned.
    concept: text('concept'),
    // Featured ("starred") track. Only one per concept should be true; that
    // track surfaces on the home page Selected Works piano key.
    isFeatured: boolean('is_featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sortOrderIdx: index('idx_tracks_sort_order').on(table.sortOrder),
    isLiveIdx: index('idx_tracks_is_live').on(table.isLive),
    conceptIdx: index('idx_tracks_concept').on(table.concept),
  })
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
  },
  (table) => ({
    trackIdIdx: index('idx_pipeline_jobs_track_id').on(table.trackId),
  })
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
  },
  (table) => ({
    keyNameIdx: index('idx_api_keys_key_name').on(table.keyName),
  })
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
  },
  (table) => ({
    isReadIdx: index('idx_briefs_is_read').on(table.isRead),
  })
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
  },
  (table) => ({
    entityIdIdx: index('idx_staging_drafts_entity_id').on(table.entityId),
  })
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

// Infer types for Drizzle
export type ComposerIdentityRow = typeof composerIdentity.$inferSelect;
export type NewComposerIdentity = typeof composerIdentity.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type TrackRow = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type PipelineJobRow = typeof pipelineJobs.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type AdminUserRow = typeof adminUsers.$inferSelect;
export type BriefRow = typeof briefs.$inferSelect;
export type StagingDraftRow = typeof stagingDrafts.$inferSelect;
export type NewStagingDraft = typeof stagingDrafts.$inferInsert;
