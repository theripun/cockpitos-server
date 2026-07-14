import { pgTable, uuid, varchar, timestamp, foreignKey } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { environments } from './environments';
import { nodes } from './nodes';

export const placements = pgTable('placements', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  environmentId: uuid('environment_id').notNull().references(() => environments.id),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  hostname: varchar('hostname', { length: 255 }).notNull().unique(), // e.g. alice-app.airnode1.reglook.com
  activeDeploymentId: uuid('active_deployment_id'), // nullable
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});