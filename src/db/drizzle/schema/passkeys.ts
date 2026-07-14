import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const passkeys = pgTable(
    'passkeys',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        credentialId: text('credential_id').notNull().unique(),
        publicKey: text('public_key').notNull(),
        counter: integer('counter').notNull().default(0),
        deviceType: text('device_type'),
        backedUp: boolean('backed_up').notNull().default(false),
        transports: jsonb('transports').$type<string[]>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('passkeys_user_id_idx').on(table.userId),
        credentialIdIdx: index('passkeys_credential_id_idx').on(table.credentialId),
    }),
);

export type Passkey = typeof passkeys.$inferSelect;
export type NewPasskey = typeof passkeys.$inferInsert;
