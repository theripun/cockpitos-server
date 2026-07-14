import { pgTable, uuid, varchar, timestamp, integer, foreignKey } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { environments } from './environments';
import { nodes } from './nodes';

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  environmentId: uuid('environment_id').notNull().references(() => environments.id),
  status: varchar('status', { length: 50 }).notNull().default('queued'), // queued|assigned|building|uploading|deploying|ready|failed|canceled
  sourceHash: varchar('source_hash', { length: 255 }), // nullable
  depsHash: varchar('deps_hash', { length: 255 }), // nullable
  artifactId: uuid('artifact_id'), // nullable
  assignedNodeId: uuid('assigned_node_id'), // nullable
  createdAt: timestamp('created_at').notNull().defaultNow(),
  startedAt: timestamp('started_at'), // nullable
  finishedAt: timestamp('finished_at'), // nullable
});