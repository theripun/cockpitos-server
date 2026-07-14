import { pgTable, uuid, varchar, text, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const calendarEvents = pgTable(
    'calendar_events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: varchar('title', { length: 255 }).notNull(),
        description: text('description'),
        startTime: timestamp('start_time', { withTimezone: true }).notNull(),
        endTime: timestamp('end_time', { withTimezone: true }).notNull(),
        color: varchar('color', { length: 50 }).notNull().default('blue'),
        category: varchar('category', { length: 50 }).notNull().default('Work'), // Work, Personal, Family
        location: varchar('location', { length: 255 }),
        meta: jsonb('meta'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('calendar_events_user_id_idx').on(table.userId),
        startTimeIdx: index('calendar_events_start_time_idx').on(table.startTime),
    }),
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
