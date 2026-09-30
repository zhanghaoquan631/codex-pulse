import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const metadata=sqliteTable('metadata',{key:text('key').primaryKey(),value:text('value').notNull()});
export const categories=sqliteTable('categories',{id:text('id').primaryKey(),position:integer('position').notNull(),payload:text('payload').notNull()});
export const books=sqliteTable('books',{id:text('id').primaryKey(),position:integer('position').notNull(),payload:text('payload').notNull()});
export const banners=sqliteTable('banners',{id:text('id').primaryKey(),position:integer('position').notNull(),payload:text('payload').notNull()});
export const sessions=sqliteTable('sessions',{hash:text('hash').primaryKey(),expires:integer('expires').notNull()});
export const uploads=sqliteTable('uploads',{url:text('url').primaryKey(),filename:text('filename').notNull(),kind:text('kind').notNull(),name:text('name').notNull(),mime:text('mime').notNull(),createdAt:text('createdAt').notNull()});
export const limits=sqliteTable('request_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),until:integer('until').notNull()});
