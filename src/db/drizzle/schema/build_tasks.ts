import { pgTable, uuid, varchar, timestamp, integer, foreignKey, jsonb } from 'drizzle-orm/pg-core';
import { deployments } from './deployments';
import { nodes } from './nodes';

export const buildTasks = pgTable('build_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id').notNull().references(() => deployments.id),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  type: varchar('type', { length: 50 }).notNull().default('build_and_deploy'), // build_and_deploy
  status: varchar('status', { length: 50 }).notNull().default('queued'), // queued|leased|running|done|failed
  leaseExpiresAt: timestamp('lease_expires_at'), // nullable
  attempts: integer('attempts').notNull().default(0),
  payload: jsonb('payload'), // JSON field to store additional data for the agent
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});