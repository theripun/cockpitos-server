import { pgTable, uuid, timestamp, real, integer, foreignKey } from 'drizzle-orm/pg-core';
import { nodes } from './nodes';

export const nodeHeartbeats = pgTable('node_heartbeats', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  cpuPercent: real('cpu_percent'),
  ramUsedMb: integer('ram_used_mb'),
  ramTotalMb: integer('ram_total_mb'),
  diskFreeGb: real('disk_free_gb'),
  buildSlotsUsed: integer('build_slots_used'),
  runtimeSlotsUsed: integer('runtime_slots_used'),
  ts: timestamp('ts').notNull().defaultNow(),
});