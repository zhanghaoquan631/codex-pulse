import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const library = sqliteTable('library', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
});
export const captureLinks = sqliteTable('capture_links', {
  id: text('id').primaryKey(), grantId: text('grant_id').notNull(), tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
  quotaWindow: integer('quota_window').notNull().default(0), previewCount: integer('preview_count').notNull().default(0),
  submissionCount: integer('submission_count').notNull().default(0), fileCount: integer('file_count').notNull().default(0),
});
export const captureFiles = sqliteTable('capture_files', {
  grantId: text('grant_id').notNull(), fileId: text('file_id').notNull(),
}, table => [primaryKey({columns:[table.grantId,table.fileId]})]);
export const jianyingDevices = sqliteTable('jianying_devices', {
  id: text('id').primaryKey(), name: text('name').notNull(), pairHash: text('pair_hash').unique(),
  pairExpires: integer('pair_expires').notNull().default(0), tokenHash: text('token_hash').unique(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull().default(0),
  lastSeen: integer('last_seen').notNull().default(0), revoked: integer('revoked').notNull().default(0),
});
export const liveDevices = sqliteTable('live_devices', {
  id:text('id').primaryKey(),name:text('name').notNull(),tokenHash:text('token_hash').notNull(),
  createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),revokedAt:integer('revoked_at'),
});
export const liveUploads = sqliteTable('live_uploads', {
  id:text('id').primaryKey(),scope:text('scope').notNull(),fileId:text('file_id').notNull(),metadata:text('metadata').notNull(),
  size:integer('size').notNull(),parts:text('parts').notNull(),status:text('status').notNull(),uploadId:text('upload_id'),type:text('type'),
  createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
});
