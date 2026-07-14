import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  label: varchar('label', { length: 255 }), // nullable
  lastUsedAt: timestamp('last_used_at'), // nullable
  expiresAt: timestamp('expires_at'), // nullable
  createdAt: timestamp('created_at').notNull().defaultNow(),
});