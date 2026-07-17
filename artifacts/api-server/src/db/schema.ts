import { relations } from 'drizzle-orm';
import { pgTable, uuid, jsonb, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

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

// Model Discovery (A3b, 2026-07-10 fix) — persists the effect of clicking
// "Apply" on a newly-discovered model so it survives a server restart.
// applyModelOverride() in aiProviders.ts still mutates the in-memory
// TEXT_PROVIDERS/IMAGE_PROVIDERS registry directly (routes/UI read that,
// unchanged) — this table is only the durable record replayed at boot via
// hydrateModelOverrides(). Not secret data, so no encryption needed
// (unlike apiKeys).
export const modelOverrides = pgTable(
  'model_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').notNull(), // 'text' | 'image'
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    label: text('label').notNull(),
    quality: integer('quality').notNull().default(3),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueOverrideIdx: uniqueIndex('idx_model_overrides_unique').on(table.kind, table.providerId, table.modelId),
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
    // 2FA (TOTP), added 2026-07-13. twoFactorSecret is the AES-encrypted
    // base32 secret (same encrypt()/decrypt() pair keys.ts already uses
    // for API keys) — never stored or returned in plaintext once
    // twoFactorEnabled flips to true.
    twoFactorSecret: text('two_factor_secret'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    // Email verification, added 2026-07-13. email is only trusted once
    // emailVerified is true (set by successfully confirming a sent code —
    // never just by typing an address). emailVerificationRequired is a
    // separate flag from emailVerified: an admin can HAVE a verified
    // email on file but choose not to require it as a login factor.
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerificationRequired: boolean('email_verification_required').notNull().default(false),
    // Holds whichever 6-digit code was most recently sent — for BOTH the
    // "confirm this is really your email" step and every login-time code.
    // pendingEmailTarget is the address the current code was sent to
    // (during initial setup this may differ from the already-verified
    // `email`, since the admin is proving a NEW address).
    pendingEmailCode: text('pending_email_code'),
    pendingEmailTarget: text('pending_email_target'),
    pendingEmailExpiresAt: timestamp('pending_email_expires_at', { withTimezone: true }),
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

// Blueprint §6.4 — the "everything is admin-editable" backbone. One row per
// (key, locale) override. Resolution order (done in routes/content.ts, not
// here): override(locale) -> override('en') -> compiled-in default living
// in the component itself. type distinguishes how EditableX should render/
// edit the value (text is plain, image/audio are asset URLs, link is a URL
// meant for hrefs). A row's mere EXISTENCE is the override; deleting it
// ("Set-to-default") falls back to the compiled default automatically.
export const contentEntries = pgTable(
  'content_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    locale: text('locale').notNull(),
    type: text('type').notNull().default('text'), // 'text' | 'image' | 'audio' | 'link'
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    updatedBy: uuid('updated_by').references(() => adminUsers.id, { onDelete: 'set null' }),
  },
  (table) => ({
    keyLocaleUnique: uniqueIndex('idx_content_entries_key_locale_unique').on(table.key, table.locale),
  })
);

// Poster Studio (2026-07-09, per Reza): admin maintains a gallery of
// reusable poster templates and a separate gallery of composer portrait
// photos. Each template carries its OWN precisely-sized YouTube and
// Instagram images (admin uploads both — no programmatic
// cropping/resizing, since exact framing matters for a template).
// Generation combines a template + optional portrait via Gemini's
// multi-image model, once per size, and every result is saved into
// generatedPosters as a persistent, browsable gallery.
export const posterTemplates = pgTable(
  'poster_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    category: text('category'), // one of the site's existing concept taxonomy (Cinema, Television, etc.) — nullable, groups the gallery
    youtubeTemplateUrl: text('youtube_template_url').notNull(),
    instagramTemplateUrl: text('instagram_template_url').notNull(),
    defaultPrompt: text('default_prompt').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sortOrderIdx: index('idx_poster_templates_sort_order').on(table.sortOrder),
  })
);

export const composerPortraits = pgTable(
  'composer_portraits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    label: text('label'),
    portraitUrl: text('portrait_url').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sortOrderIdx: index('idx_composer_portraits_sort_order').on(table.sortOrder),
  })
);

// Persistent gallery of finished poster generations — one row PER
// PLATFORM (2026-07-10, per Reza: YouTube and Instagram are generated,
// regenerated, and saved completely independently — never forced to
// happen together). Browsable later and selectable as track cover art
// from Media Pipeline ("Select from Library").
export const generatedPosters = pgTable(
  'generated_posters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: uuid('template_id').references(() => posterTemplates.id, { onDelete: 'set null' }),
    templateName: text('template_name'), // snapshot, survives template deletion
    portraitId: uuid('portrait_id').references(() => composerPortraits.id, { onDelete: 'set null' }),
    platform: text('platform').notNull(), // 'youtube' | 'instagram'
    posterUrl: text('poster_url').notNull(),
    promptUsed: text('prompt_used'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    createdAtIdx: index('idx_generated_posters_created_at').on(table.createdAt),
    platformIdx: index('idx_generated_posters_platform').on(table.platform),
  })
);

// Business Scanner (Phase 5 / A3c, 2026-07-13). Source-agnostic by design:
// `source` records which adapter found it (rss, google-search, official-api
// names as they're added later); nothing here assumes any specific source
// exists or that any API key is configured — the scanner runs (and this
// table fills up) from RSS alone with zero keys. `score` and `lang` are
// filled by keyword-rule scoring always; if an AI key is configured, the
// same fields are OVERWRITTEN with the LLM's more precise pass — never a
// second, separate set of columns. `contacts` is JSON (a lead may have an
// email, a form URL, a phone, or several) rather than forcing one shape.
export const positionLeads = pgTable(
  'position_leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: text('source').notNull(), // 'rss' | 'google-search' | future adapter names
    sourceUrl: text('source_url'), // the feed/search endpoint that produced this, for debugging
    url: text('url').notNull(), // the actual posting/listing
    project: text('project'),
    company: text('company'),
    person: text('person'),
    details: text('details'),
    contacts: jsonb('contacts').notNull().default({}), // { email?, formUrl?, phone? }
    lang: text('lang'), // detected/declared language of the listing
    score: integer('score').notNull().default(0), // 0-100 relevance
    scoredBy: text('scored_by').notNull().default('rules'), // 'rules' | 'ai'
    status: text('status').notNull().default('new'), // 'new' | 'reviewed' | 'dismissed'
    firstSeen: timestamp('first_seen', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    urlUniqueIdx: uniqueIndex('idx_position_leads_url_unique').on(table.url), // the actual dedupe key
    scoreIdx: index('idx_position_leads_score').on(table.score),
    statusIdx: index('idx_position_leads_status').on(table.status),
    firstSeenIdx: index('idx_position_leads_first_seen').on(table.firstSeen),
  })
);

export const positionReports = pgTable(
  'position_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportUrl: text('report_url').notNull(), // S3 URL of the generated .xlsx
    leadCount: integer('lead_count').notNull().default(0),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    createdAtIdx: index('idx_position_reports_created_at').on(table.createdAt),
  })
);


// 2026-07-14 (per Reza): every visitor conversation with ExecutiveStudioBot,
// so Reza can review them in the admin Business tab and reach out
// personally if a visitor left contact info in the chat. Keyed by
// conversationId (client-generated once per widget session) — the chat
// route upserts this same row on every turn rather than needing a
// separate "save conversation" call, so a log exists even if the visitor
// never explicitly submits anything (unlike `briefs`, which only exists
// once the structured brief flow completes).
export const chatLogs = pgTable(
  'chat_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: text('conversation_id').notNull(),
    locale: text('locale').notNull(),
    messages: jsonb('messages').notNull().default([]), // [{role,text,timestamp}, ...] — full transcript so far
    isRead: boolean('is_read').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    conversationIdUnique: uniqueIndex('idx_chat_logs_conversation_id_unique').on(table.conversationId),
    updatedAtIdx: index('idx_chat_logs_updated_at').on(table.updatedAt),
  })
);

// ============================================================
// Document Assistant — saved analyses (2026-07-16).
// One row per uploaded/pasted document ever run through AI analysis.
// Checklist items are persisted as a jsonb array so admin check/uncheck
// state survives across sessions instead of being a one-shot in-memory
// result, matching every other "review panel" pattern in this project
// (Media Pipeline, Poster Studio) where AI output becomes a durable,
// admin-editable record rather than a disposable response.
// ============================================================
export const documentAnalyses = pgTable(
  'document_analyses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    filename: text('filename').notNull(),
    fileType: text('file_type').notNull(), // 'pdf' | 'txt' | 'eml' | 'paste'
    sourceFileUrl: text('source_file_url'), // S3 — null for pasted-text analyses (no original file)
    summary: text('summary'),
    parties: jsonb('parties').notNull().default([]), // [{name, role}]
    deliverables: jsonb('deliverables').notNull().default([]), // [string]
    deadlines: jsonb('deadlines').notNull().default([]), // [{item, date}] — date is a free-text string (AI-extracted, not always ISO)
    paymentTerms: jsonb('payment_terms').notNull().default([]), // [string]
    timecodes: jsonb('timecodes').notNull().default([]), // [string]
    risks: jsonb('risks').notNull().default([]), // [string] — ambiguities/risks worth flagging to the composer
    checklist: jsonb('checklist').notNull().default([]), // [{id, text, priority:'high'|'medium'|'low', category, done}]
    // 2026-07-16 — cross-referenced music tracks. When the document
    // mentions a track/file name, this holds the matched track(s) from
    // the tracks table plus an AI-generated one-line assessment of
    // whether the brief's stated requirements fit that track's REAL
    // audio characteristics (BPM/mood/key/genre + the AI's own prior
    // listening analysis, already computed by Media Pipeline). [{trackId,
    // title, coverUrl, bpm, mood, keySignature, genre, aiListenAnalysis,
    // matchedFrom, fitAssessment}]
    trackMatches: jsonb('track_matches').notNull().default([]),
    degraded: boolean('degraded').default(false), // true when AI was unavailable and this is a bare-extraction fallback
    sourceTextLength: integer('source_text_length').default(0),
    truncated: boolean('truncated').default(false), // true if the source text exceeded the AI prompt cap and was trimmed
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    createdAtIdx: index('idx_document_analyses_created_at').on(table.createdAt),
  })
);

export type DocumentAnalysisRow = typeof documentAnalyses.$inferSelect;
export type NewDocumentAnalysis = typeof documentAnalyses.$inferInsert;

// ============================================================
// SEO & Accessibility audits (2026-07-16).
// One row per "Run Audit" click in the admin's SEO & Accessibility tab.
// Real Google Lighthouse scores (not estimates) + the specific failing
// checks Lighthouse found + an AI plain-language prioritization of
// them. History lets the admin tab chart real score trends over time.
// ============================================================
export const seoAudits = pgTable('seo_audits', {
  id: uuid('id').defaultRandom().primaryKey(),
  auditedUrl: text('audited_url').notNull(),
  seoScore: integer('seo_score').notNull(),
  accessibilityScore: integer('accessibility_score').notNull(),
  performanceScore: integer('performance_score').notNull(),
  bestPracticesScore: integer('best_practices_score').notNull(),
  issues: jsonb('issues').notNull().default([]), // [{id, title, description, category, score}]
  aiSummary: text('ai_summary'),
  aiPriorities: jsonb('ai_priorities').notNull().default([]), // [{title, explanation, severity}]
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type SeoAuditRow = typeof seoAudits.$inferSelect;
export type NewSeoAudit = typeof seoAudits.$inferInsert;

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

export const contentEntriesRelations = relations(contentEntries, ({ one }) => ({
  updatedByUser: one(adminUsers, { fields: [contentEntries.updatedBy], references: [adminUsers.id] }),
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
export type ContentEntryRow = typeof contentEntries.$inferSelect;
export type NewContentEntry = typeof contentEntries.$inferInsert;
export type PosterTemplateRow = typeof posterTemplates.$inferSelect;
export type NewPosterTemplate = typeof posterTemplates.$inferInsert;
export type ComposerPortraitRow = typeof composerPortraits.$inferSelect;
export type NewComposerPortrait = typeof composerPortraits.$inferInsert;
export type GeneratedPosterRow = typeof generatedPosters.$inferSelect;
export type NewGeneratedPoster = typeof generatedPosters.$inferInsert;
export type PositionLeadRow = typeof positionLeads.$inferSelect;
export type NewPositionLead = typeof positionLeads.$inferInsert;
export type PositionReportRow = typeof positionReports.$inferSelect;
export type NewPositionReport = typeof positionReports.$inferInsert;
