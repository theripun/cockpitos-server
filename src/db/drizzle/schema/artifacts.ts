import { pgTable, uuid, varchar, bigint, timestamp, foreignKey } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { deployments } from './deployments';

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  deploymentId: uuid('deployment_id').notNull().references(() => deployments.id),
  r2Key: varchar('r2_key', { length: 500 }).notNull().unique(),
  sha256: varchar('sha256', { length: 64 }).notNull(), // SHA256 hash
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});