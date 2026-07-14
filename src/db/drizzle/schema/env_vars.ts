import { pgTable, uuid, varchar, text, timestamp, boolean, foreignKey } from 'drizzle-orm/pg-core';
import { environments } from './environments';

export const envVars = pgTable('env_vars', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id').notNull().references(() => environments.id),
  key: varchar('key', { length: 255 }).notNull(),
  valueEncrypted: text('value_encrypted').notNull(), // encrypted value
  isSecret: boolean('is_secret').notNull().default(false),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});