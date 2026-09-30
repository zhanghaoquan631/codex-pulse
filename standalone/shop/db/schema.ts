import { integer, sqliteTable, text, real, index } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('shop_settings', {
  id: integer('id').primaryKey(), data: text('data').notNull(),
});
export const products = sqliteTable('shop_products', {
  id: text('id').primaryKey(), data: text('data').notNull(),
  stock: integer('stock'), price: real('price').notNull(), status: text('status').notNull(),
}, (t) => [index('idx_products_status').on(t.status)]);
export const orders = sqliteTable('shop_orders', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(),
  data: text('data').notNull(), status: text('status').notNull(),
  tokenHash: text('token_hash').notNull(), inventoryReserved: integer('inventory_reserved').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_orders_created_at').on(t.createdAt)]);
export const sessions = sqliteTable('shop_sessions', {
  tokenHash: text('token_hash').primaryKey(), expiresAt: integer('expires_at').notNull(),
  credentialVersion: text('credential_version').notNull(),
}, (t) => [index('idx_sessions_expiry').on(t.expiresAt)]);
export const limits = sqliteTable('shop_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: integer('expires_at').notNull(),
}, (t) => [index('idx_limits_expiry').on(t.expiresAt)]);
export const resetFeedCache = sqliteTable('reset_feed_cache', {
  id: integer('id').primaryKey(), data: text('data').notNull(), fetchedAt: integer('fetched_at').notNull(),
});
