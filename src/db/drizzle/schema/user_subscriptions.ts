import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userSubscriptions = pgTable(
    'user_subscriptions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        plan: varchar('plan', { length: 40 }).notNull().default('free'),
        status: varchar('status', { length: 40 }).notNull().default('active'),
        source: varchar('source', { length: 80 }).notNull().default('developer_grant'),
        startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
        endsAt: timestamp('ends_at', { withTimezone: true }),
        canceledAt: timestamp('canceled_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdUniqueIdx: uniqueIndex('user_subscriptions_user_id_unique_idx').on(table.userId),
        userIdIdx: index('user_subscriptions_user_id_idx').on(table.userId),
        planStatusIdx: index('user_subscriptions_plan_status_idx').on(table.plan, table.status),
        endsAtIdx: index('user_subscriptions_ends_at_idx').on(table.endsAt),
    }),
);

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type NewUserSubscription = typeof userSubscriptions.$inferInsert;
