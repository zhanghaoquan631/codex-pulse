import { sqliteTable, text, integer, blob, index, uniqueIndex, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull(),
  created_at: integer('created_at').notNull(),
  last_login_at: integer('last_login_at').notNull(),
  login_count: integer('login_count').notNull().default(sql.raw("1")),
  last_ip: text('last_ip'),
  last_user_agent: text('last_user_agent'),
}, t => [
  uniqueIndex('users_email_unique').on(t.email),
]);

export const login_challenges = sqliteTable('login_challenges', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull(),
  code_hash: blob('code_hash', {mode:'buffer'}).notNull(),
  created_at: integer('created_at').notNull(),
  sent_at: integer('sent_at').notNull(),
  expires_at: integer('expires_at').notNull(),
  consumed_at: integer('consumed_at'),
  attempts_remaining: integer('attempts_remaining').notNull(),
  request_ip: text('request_ip'),
  user_agent: text('user_agent'),
  transport_message_id: text('transport_message_id'),
}, t => [
  index('idx_challenges_email_sent').on(t.email,t.sent_at),
]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().notNull(),
  token_hash: blob('token_hash', {mode:'buffer'}).notNull(),
  user_id: text('user_id'),
  email: text('email').notNull(),
  kind: text('kind').notNull(),
  created_at: integer('created_at').notNull(),
  expires_at: integer('expires_at').notNull(),
  last_seen_at: integer('last_seen_at').notNull(),
  ip: text('ip'),
  user_agent: text('user_agent'),
}, t => [
  index('idx_sessions_expires').on(t.expires_at),
  uniqueIndex('sessions_token_hash_unique').on(t.token_hash),
]);

export const login_events = sqliteTable('login_events', {
  id: text('id').primaryKey().notNull(),
  email: text('email'),
  event_type: text('event_type').notNull(),
  success: integer('success').notNull(),
  detail: text('detail'),
  ip: text('ip'),
  user_agent: text('user_agent'),
  created_at: integer('created_at').notNull(),
}, t => [
  index('idx_events_email').on(t.email,t.created_at),
  index('idx_events_created').on(t.created_at),
]);

export const auth_send_reservations = sqliteTable('auth_send_reservations', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull(),
  ip: text('ip').notNull(),
  created_at: integer('created_at').notNull(),
}, t => [
  index('idx_auth_send_created').on(t.created_at),
  index('idx_auth_send_ip').on(t.ip,t.created_at),
  index('idx_auth_send_email').on(t.email,t.created_at),
]);

export const auth_verify_reservations = sqliteTable('auth_verify_reservations', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull(),
  ip: text('ip').notNull(),
  created_at: integer('created_at').notNull(),
}, t => [
  index('idx_auth_verify_ip').on(t.ip,t.created_at),
  index('idx_auth_verify_email').on(t.email,t.created_at),
]);

export const gallery_quest_accounts = sqliteTable('gallery_quest_accounts', {
  owner_key: text('owner_key').primaryKey().notNull(),
  run_id: text('run_id').notNull(),
  revision: integer('revision').notNull(),
  quest_json: text('quest_json').notNull(),
  reset_id: text('reset_id'),
  history_json: text('history_json').notNull().default(sql.raw("'[]'")),
  updated_at: text('updated_at').notNull(),
}, t => [
  check('gallery_quest_accounts_check_1', sql.raw("revision >= 1")),
]);

export const gallery_game_scores = sqliteTable('gallery_game_scores', {
  owner_key: text('owner_key').primaryKey().notNull(),
  score: integer('score').notNull().default(sql.raw("0")),
  correct: integer('correct').notNull().default(sql.raw("0")),
  wrong: integer('wrong').notNull().default(sql.raw("0")),
  updated_at: text('updated_at').notNull(),
}, t => [

]);

export const gallery_grants = sqliteTable('gallery_grants', {
  token_hash: text('token_hash').primaryKey().notNull(),
  owner_key: text('owner_key').notNull(),
  created_at: text('created_at').notNull(),
  expires_at: integer('expires_at').notNull(),
  revoked_at: integer('revoked_at'),
}, t => [
  index('gallery_grants_owner_created').on(t.owner_key,t.created_at),
]);

export const gallery_works = sqliteTable('gallery_works', {
  id: text('id').primaryKey().notNull(),
  owner_key: text('owner_key').notNull(),
  filename: text('filename').notNull(),
  object_key: text('object_key').notNull(),
  original_name: text('original_name').notNull(),
  mime_type: text('mime_type').notNull(),
  size: integer('size').notNull(),
  created_at: text('created_at').notNull(),
}, t => [
  index('gallery_works_owner_created').on(t.owner_key,t.created_at,t.id),
  uniqueIndex('gallery_works_owner_filename').on(t.owner_key,t.filename),
  uniqueIndex('gallery_works_object_key_unique').on(t.object_key),
]);

export const gallery_storage_usage = sqliteTable('gallery_storage_usage', {
  scope: text('scope').primaryKey().notNull(),
  used_bytes: integer('used_bytes').notNull().default(sql.raw("0")),
  file_count: integer('file_count').notNull().default(sql.raw("0")),
  max_bytes: integer('max_bytes').notNull(),
  max_files: integer('max_files').notNull(),
}, t => [
  check('gallery_storage_usage_check_1', sql.raw("used_bytes >= 0 AND used_bytes <= max_bytes")),
  check('gallery_storage_usage_check_2', sql.raw("file_count >= 0 AND file_count <= max_files")),
]);

export const gallery_upload_reservations = sqliteTable('gallery_upload_reservations', {
  id: text('id').primaryKey().notNull(),
  owner_key: text('owner_key').notNull(),
  object_key: text('object_key').notNull(),
  size: integer('size').notNull(),
  created_at: integer('created_at').notNull(),
}, t => [
  index('gallery_upload_reservations_created').on(t.created_at),
  uniqueIndex('gallery_upload_reservations_object_key_unique').on(t.object_key),
]);

export const media_objects = sqliteTable('media_objects', {
  id: text('id').primaryKey().notNull(),
  owner_key: text('owner_key').notNull(),
  object_key: text('object_key').notNull(),
  filename: text('filename').notNull(),
  original_filename: text('original_filename').notNull(),
  media_type: text('media_type').notNull(),
  size: integer('size').notNull(),
  caption: text('caption').notNull().default(sql.raw("''")),
  placement: text('placement').notNull().default(sql.raw("''")),
  created_at: integer('created_at').notNull(),
  expires_at: integer('expires_at'),
  kind: text('kind').notNull(),
  link_hash: text('link_hash'),
  state: text('state').notNull(),
}, t => [
  index('media_objects_link').on(t.link_hash),
  index('media_objects_expiry').on(t.owner_key,t.expires_at),
  index('media_objects_owner').on(t.owner_key,t.kind,t.state,t.created_at),
  uniqueIndex('media_objects_filename_unique').on(t.filename),
  uniqueIndex('media_objects_object_key_unique').on(t.object_key),
  check('media_objects_check_1', sql.raw("size > 0 AND size <= 20971520")),
  check('media_objects_check_2', sql.raw("kind IN ('owner', 'guest')")),
  check('media_objects_check_3', sql.raw("state IN ('reserved', 'ready')")),
]);

export const media_links = sqliteTable('media_links', {
  token_hash: text('token_hash').primaryKey().notNull(),
  owner_key: text('owner_key').notNull(),
  kind: text('kind').notNull(),
  pin_salt: text('pin_salt'),
  pin_hash: text('pin_hash'),
  created_at: integer('created_at').notNull(),
  expires_at: integer('expires_at'),
  revoked_at: integer('revoked_at'),
  upload_count: integer('upload_count').notNull().default(sql.raw("0")),
  failed_pins: integer('failed_pins').notNull().default(sql.raw("0")),
  locked_until: integer('locked_until').notNull().default(sql.raw("0")),
}, t => [
  index('media_links_owner').on(t.owner_key,t.kind,t.expires_at),
  check('media_links_check_1', sql.raw("kind IN ('owner', 'guest')")),
]);

export const media_sessions = sqliteTable('media_sessions', {
  token_hash: text('token_hash').primaryKey().notNull(),
  link_hash: text('link_hash').notNull(),
  owner_key: text('owner_key').notNull(),
  expires_at: integer('expires_at').notNull(),
}, t => [
  index('media_sessions_link').on(t.link_hash),
  index('media_sessions_owner').on(t.owner_key,t.expires_at),
]);

export const media_pageviews = sqliteTable('media_pageviews', {
  day: text('day').notNull(),
  event_id: text('event_id').notNull(),
  hour: integer('hour').notNull(),
  path: text('path').notNull(),
  created_at: integer('created_at').notNull(),
}, t => [
  primaryKey({columns:[t.day,t.event_id]}),
  index('media_pageviews_hours').on(t.day,t.hour),
  check('media_pageviews_check_1', sql.raw("hour BETWEEN 0 AND 23")),
]);

export const account_state = sqliteTable('account_state', {
  user_key: text('user_key').notNull(),
  name: text('name').notNull(),
  value: text('value').notNull(),
  revision: integer('revision').notNull(),
  updated_at: integer('updated_at').notNull(),
}, t => [
  primaryKey({columns:[t.user_key,t.name]}),
]);

export const account_saved = sqliteTable('account_saved', {
  user_key: text('user_key').notNull(),
  url: text('url').notNull(),
  created_at: integer('created_at').notNull(),
}, t => [
  primaryKey({columns:[t.user_key,t.url]}),
]);

export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey().notNull(),
  owner_key: text('owner_key').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  notes: text('notes').notNull(),
  date: text('date').notNull(),
  time: text('time').notNull(),
  ip_hash: text('ip_hash').notNull(),
  created_at: integer('created_at').notNull(),
  notification: text('notification').notNull(),
}, t => [
  index('bookings_email_created').on(t.email,t.created_at),
  index('bookings_ip_created').on(t.ip_hash,t.created_at),
  index('bookings_owner_created').on(t.owner_key,t.created_at),
]);

// Append to db/schema.js (reuse existing sqliteTable/text/integer/index/uniqueIndex imports).
export const racingRooms = sqliteTable('racing_rooms', {
  id: text('id').primaryKey().notNull(),
  trackId: text('track_id').notNull(),
  stateJson: text('state_json').notNull(),
  revision: integer('revision').notNull().default(0),
  createKeyHash: text('create_key_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [
  uniqueIndex('racing_rooms_create_key_idx').on(table.createKeyHash),
  index('racing_rooms_expiry_idx').on(table.expiresAt),
]);
