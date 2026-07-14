import { pgTable, uuid, varchar, timestamp, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const cliDeviceCodes = pgTable('cli_device_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceCode: varchar('device_code', { length: 255 }).notNull().unique(),
  userCode: varchar('user_code', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending|approved|expired
  userId: uuid('user_id').references(() => users.id), // nullable
  expiresAt: timestamp('expires_at').notNull(),
  intervalSeconds: integer('interval_seconds').notNull().default(2),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});