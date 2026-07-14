import { pgTable, uuid, varchar, text, timestamp, doublePrecision, integer, date, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userActivityDaily = pgTable('user_activity_daily', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    activeSeconds: integer('active_seconds').notNull().default(0),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    userIdIdx: index('user_activity_daily_user_id_idx').on(table.userId),
    dateIdx: index('user_activity_daily_date_idx').on(table.date),
}));

export const userLocationLogs = pgTable('user_location_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    accuracy: doublePrecision('accuracy'),
    ipAddress: varchar('ip_address', { length: 45 }),
    city: varchar('city', { length: 100 }),
    country: varchar('country', { length: 100 }),
    isp: varchar('isp', { length: 255 }),
    browser: varchar('browser', { length: 100 }),
    os: varchar('os', { length: 100 }),
    device: varchar('device', { length: 100 }),
    userAgent: text('user_agent'),
    page: varchar('page', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    userIdIdx: index('user_location_logs_user_id_idx').on(table.userId),
    createdAtIdx: index('user_location_logs_created_at_idx').on(table.createdAt),
}));

export const userIpLogs = pgTable('user_ip_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    userIdIdx: index('user_ip_logs_user_id_idx').on(table.userId),
    ipAddressIdx: index('user_ip_logs_ip_address_idx').on(table.ipAddress),
}));

export const userSessions = pgTable('user_sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    browser: varchar('browser', { length: 100 }),
    os: varchar('os', { length: 100 }),
    device: varchar('device', { length: 100 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    isActive: integer('is_active').notNull().default(1),
}, (table) => ({
    userIdIdx: index('user_sessions_user_id_idx').on(table.userId),
    isActiveIdx: index('user_sessions_is_active_idx').on(table.isActive),
}));

export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }),
    entityId: varchar('entity_id', { length: 100 }),
    metadata: jsonb('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
    actionIdx: index('audit_logs_action_idx').on(table.action),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));
