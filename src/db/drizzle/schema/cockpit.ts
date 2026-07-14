import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const cockpitVps = pgTable(
    'cockpit_vps',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 255 }).notNull(),
        host: varchar('host', { length: 255 }).notNull(),
        port: integer('port').notNull().default(22),
        username: varchar('username', { length: 255 }).notNull(),
        encryptedPassword: text('encrypted_password').notNull(),
        status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, verified, failed, agent_installed
        serverFingerprint: varchar('server_fingerprint', { length: 255 }),
        lastError: text('last_error'),
        verifiedAt: timestamp('verified_at', { withTimezone: true }),
        meta: jsonb('meta'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('cockpit_vps_user_id_idx').on(table.userId),
    }),
);

export type CockpitVps = typeof cockpitVps.$inferSelect;
export type NewCockpitVps = typeof cockpitVps.$inferInsert;

export const cockpitTerminalSessions = pgTable(
    'cockpit_terminal_sessions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        vpsId: uuid('vps_id')
            .notNull()
            .references(() => cockpitVps.id, { onDelete: 'cascade' }),
        status: varchar('status', { length: 50 }).notNull().default('created'), // created, connected, closed, failed
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        connectedAt: timestamp('connected_at', { withTimezone: true }),
        closedAt: timestamp('closed_at', { withTimezone: true }),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        meta: jsonb('meta'),
    },
    (table) => ({
        userIdIdx: index('cockpit_terminal_sessions_user_id_idx').on(table.userId),
        vpsIdIdx: index('cockpit_terminal_sessions_vps_id_idx').on(table.vpsId),
    }),
);

export type CockpitTerminalSession = typeof cockpitTerminalSessions.$inferSelect;
export type NewCockpitTerminalSession = typeof cockpitTerminalSessions.$inferInsert;

export const cockpitNotes = pgTable(
    'cockpit_notes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: varchar('title', { length: 255 }).notNull(),
        content: text('content').notNull().default(''),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('cockpit_notes_user_id_idx').on(table.userId),
    }),
);

export type CockpitNote = typeof cockpitNotes.$inferSelect;
export type NewCockpitNote = typeof cockpitNotes.$inferInsert;
