import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(), // airnode1
  baseDomain: varchar('base_domain', { length: 255 }).notNull(), // airnode1.reglook.com
  agentKeyHash: varchar('agent_key_hash', { length: 255 }).notNull(),
  capabilities: jsonb('capabilities').notNull(), // {"docker":true,"traefik":true}
  buildSlotsTotal: integer('build_slots_total').notNull(),
  runtimeSlotsTotal: integer('runtime_slots_total').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active|draining|disabled
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});