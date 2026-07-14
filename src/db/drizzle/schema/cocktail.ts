import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index, boolean, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { cockpitVps } from './cockpit';

// 3.1 cocktail_devices
export const cocktailDevices = pgTable(
    'cocktail_devices',
    {
        id: uuid('id').primaryKey().defaultRandom(), // deviceId
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        vpsId: uuid('vps_id')
            .notNull()
            .references(() => cockpitVps.id, { onDelete: 'cascade' }),
        name: text('name').notNull(), // default: vps.name or hostname
        status: varchar('status', { length: 50 }).notNull().default('enrolling'), // enrolling | online | offline | error | disabled
        lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
        enrolledAt: timestamp('enrolled_at', { withTimezone: true }),
        disabledAt: timestamp('disabled_at', { withTimezone: true }),
        agentVersion: text('agent_version'),
        os: text('os'),
        arch: text('arch'),
        hostname: text('hostname'),
        lastIp: text('last_ip'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('cocktail_devices_user_id_idx').on(table.userId),
        vpsIdIdx: index('cocktail_devices_vps_id_idx').on(table.vpsId),
        statusIdx: index('cocktail_devices_status_idx').on(table.status),
        lastSeenIdx: index('cocktail_devices_last_seen_at_idx').on(table.lastSeenAt),
        uniqueVps: unique('cocktail_devices_vps_id_unique').on(table.vpsId), // one agent per VPS for now
    }),
);

export type CocktailDevice = typeof cocktailDevices.$inferSelect;
export type NewCocktailDevice = typeof cocktailDevices.$inferInsert;

// 3.2 cocktail_device_secrets
export const cocktailDeviceSecrets = pgTable(
    'cocktail_device_secrets',
    {
        deviceId: uuid('device_id')
            .primaryKey()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        secretHash: text('secret_hash').notNull(),
        encryptedSecret: text('encrypted_secret'), // For HMAC verification
        secretCreatedAt: timestamp('secret_created_at', { withTimezone: true }).notNull().defaultNow(),
        secretLastUsedAt: timestamp('secret_last_used_at', { withTimezone: true }),
        rotatedAt: timestamp('rotated_at', { withTimezone: true }),
        isActive: boolean('is_active').default(true),
    }
);

export type CocktailDeviceSecret = typeof cocktailDeviceSecrets.$inferSelect;
export type NewCocktailDeviceSecret = typeof cocktailDeviceSecrets.$inferInsert;

// 3.3 cocktail_enrollment_tokens
export const cocktailEnrollmentTokens = pgTable(
    'cocktail_enrollment_tokens',
    {
        tokenHash: text('token_hash').primaryKey(),
        deviceId: uuid('device_id')
            .notNull()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        usedAt: timestamp('used_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    }
);

export type CocktailEnrollmentToken = typeof cocktailEnrollmentTokens.$inferSelect;
export type NewCocktailEnrollmentToken = typeof cocktailEnrollmentTokens.$inferInsert;

// 3.4 cocktail_tasks
export const cocktailTasks = pgTable(
    'cocktail_tasks',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        deviceId: uuid('device_id')
            .notNull()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        type: text('type').notNull(), // enum-like
        payload: jsonb('payload').notNull(),
        status: varchar('status', { length: 50 }).notNull().default('queued'), // queued | leased | running | succeeded | failed | canceled
        leaseId: text('lease_id'),
        leasedAt: timestamp('leased_at', { withTimezone: true }),
        leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
        attempts: integer('attempts').default(0),
        result: jsonb('result'),
        error: text('error'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        deviceStatusIdx: index('cocktail_tasks_device_id_status_idx').on(table.deviceId, table.status),
        statusLeaseExpIdx: index('cocktail_tasks_status_lease_expires_at_idx').on(table.status, table.leaseExpiresAt),
    })
);

export type CocktailTask = typeof cocktailTasks.$inferSelect;
export type NewCocktailTask = typeof cocktailTasks.$inferInsert;

// 3.5 cocktail_metrics_latest
export const cocktailMetricsLatest = pgTable(
    'cocktail_metrics_latest',
    {
        deviceId: uuid('device_id')
            .primaryKey()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        metrics: jsonb('metrics').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    }
);

export type CocktailMetricsLatest = typeof cocktailMetricsLatest.$inferSelect;
export type NewCocktailMetricsLatest = typeof cocktailMetricsLatest.$inferInsert;

// 3.6 cocktail_transfers
export const cocktailTransfers = pgTable(
    'cocktail_transfers',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        deviceId: uuid('device_id')
            .notNull()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        type: varchar('type', { length: 20 }).notNull(), // 'upload' | 'download'
        path: text('path').notNull(),
        sizeBytes: integer('size_bytes'), // nullable for downloads if unknown
        status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | streaming | done | failed
        error: text('error'),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        deviceStatusIdx: index('cocktail_transfers_device_id_status_idx').on(table.deviceId, table.status),
        userIdIdx: index('cocktail_transfers_user_id_idx').on(table.userId),
    })
);

export type CocktailTransfer = typeof cocktailTransfers.$inferSelect;
export type NewCocktailTransfer = typeof cocktailTransfers.$inferInsert;

// 3.6.1 cocktail_uploads (Cloud-based transfers via R2)
export const cocktailUploads = pgTable(
    'cocktail_uploads',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        deviceId: uuid('device_id')
            .notNull()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        vpsId: uuid('vps_id')
            .notNull()
            .references(() => cockpitVps.id, { onDelete: 'cascade' }),
        objectKey: text('object_key').notNull(),
        filename: text('filename').notNull(),
        sizeBytes: integer('size_bytes').notNull(),
        mimeType: text('mime_type'),
        destPath: text('dest_path').notNull(),
        status: varchar('status', { length: 20 }).notNull().default('INIT'), // INIT | UPLOADED | TASKED | DONE | FAILED
        sha256: text('sha256'),
        taskId: uuid('task_id'), // Reference to cocktail_tasks.id
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('cocktail_uploads_user_id_idx').on(table.userId),
        vpsIdIdx: index('cocktail_uploads_vps_id_idx').on(table.vpsId),
        statusIdx: index('cocktail_uploads_status_idx').on(table.status),
    })
);

export type CocktailUpload = typeof cocktailUploads.$inferSelect;
export type NewCocktailUpload = typeof cocktailUploads.$inferInsert;

// 3.7 cocktail_fs_cache
export const cocktailFsCache = pgTable(
    'cocktail_fs_cache',
    {
        deviceId: uuid('device_id')
            .notNull()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        path: text('path').notNull(),
        items: jsonb('items').notNull(), // array of FileSystemItem from agent
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        pk: unique('cocktail_fs_cache_pk').on(table.deviceId, table.path),
        devicePathIdx: index('cocktail_fs_cache_device_path_idx').on(table.deviceId, table.path),
    })
);

export type CocktailFsCache = typeof cocktailFsCache.$inferSelect;
export type NewCocktailFsCache = typeof cocktailFsCache.$inferInsert;
// 3.8 cocktail_processes_latest
export const cocktailProcessesLatest = pgTable(
    'cocktail_processes_latest',
    {
        deviceId: uuid('device_id')
            .primaryKey()
            .references(() => cocktailDevices.id, { onDelete: 'cascade' }),
        items: jsonb('items').notNull(), // snapshot of processes
        capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    }
);

export type CocktailProcessesLatest = typeof cocktailProcessesLatest.$inferSelect;
export type NewCocktailProcessesLatest = typeof cocktailProcessesLatest.$inferInsert;
