
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DrizzleService } from './src/db/drizzle/drizzle.service';
import { users } from './src/db/drizzle/schema';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';

async function bootstrap() {
    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const drizzle = app.get(DrizzleService);
    const db = drizzle.db;

    const email = 'admin@example.com';
    const username = 'admin';
    const password = 'password123';
    const firstName = 'Admin';
    const lastName = 'User';

    console.log(`Creating user: ${username} (${email}) ...`);

    // Check if user exists
    const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing) {
        console.log(`User ${username} already exists with ID: ${existing.id}`);
        // Optionally update password
        const passwordHash = await argon2.hash(password);
        await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
        console.log('Password updated to: ' + password);
        await app.close();
        return;
    }

    const passwordHash = await argon2.hash(password);

    const [user] = await db.insert(users).values({
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        role: 'admin',
        marketingOptIn: false,
    }).returning();

    console.log('✅ User created successfully!');
    console.log('------------------------------------------------');
    console.log(`ID:       ${user.id}`);
    console.log(`Username: ${user.username}`);
    console.log(`Email:    ${user.email}`);
    console.log(`Password: ${password}`);
    console.log('------------------------------------------------');
    console.log('You can now log in with these credentials.');

    await app.close();
}

bootstrap().catch(err => {
    console.error('Failed to create user:', err);
    process.exit(1);
});
