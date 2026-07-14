import { pgTable, uuid, varchar, boolean, timestamp, index, integer } from 'drizzle-orm/pg-core';

export const users = pgTable(
    'users',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        email: varchar('email', { length: 255 }).notNull().unique(),
        username: varchar('username', { length: 100 }).notNull().unique(),
        firstName: varchar('first_name', { length: 100 }).notNull(),
        lastName: varchar('last_name', { length: 100 }).notNull(),
        passwordHash: varchar('password_hash', { length: 255 }),
        marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
        role: varchar('role', { length: 20 }).notNull().default('user'),
        wallpaperId: integer('wallpaper_id').default(28),
        otp: varchar('otp', { length: 20 }),
        otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
        resetPasswordToken: varchar('reset_password_token', { length: 255 }),
        resetPasswordExpiresAt: timestamp('reset_password_expires_at', { withTimezone: true }),
        isEmailVerified: boolean('is_email_verified').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        emailIdx: index('users_email_idx').on(table.email),
        usernameIdx: index('users_username_idx').on(table.username),
    }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
