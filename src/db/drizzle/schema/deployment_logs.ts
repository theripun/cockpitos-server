import { pgTable, uuid, varchar, timestamp, text, foreignKey } from 'drizzle-orm/pg-core';
import { deployments } from './deployments';

export const deploymentLogs = pgTable('deployment_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id').notNull().references(() => deployments.id),
  ts: timestamp('ts').notNull().defaultNow(),
  level: varchar('level', { length: 20 }).notNull(), // info, warn, error, debug
  message: text('message').notNull(),
});