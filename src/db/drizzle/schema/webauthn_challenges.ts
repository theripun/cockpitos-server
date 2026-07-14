import { pgTable, uuid, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const webauthnChallenges = pgTable(
    'webauthn_challenges',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        challenge: text('challenge').notNull(),
        type: varchar('type', { length: 20 }).notNull(), // 'registration' | 'authentication'
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('webauthn_challenges_user_id_idx').on(table.userId),
        expiresAtIdx: index('webauthn_challenges_expires_at_idx').on(table.expiresAt),
    }),
);

export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect;
export type NewWebauthnChallenge = typeof webauthnChallenges.$inferInsert;
