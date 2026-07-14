
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DrizzleService } from './src/db/drizzle/drizzle.service';
import { users } from './src/db/drizzle/schema';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';

async function bootstrap() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: pnpm exec ts-node reset-password.ts <username> <new_password>');
        process.exit(1);
    }

    const [targetUsername, newPassword] = args;

    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const drizzle = app.get(DrizzleService);
    const db = drizzle.db;

    console.log(`Searching for user: ${targetUsername} ...`);

    const [user] = await db.select().from(users).where(eq(users.username, targetUsername)).limit(1);

    if (!user) {
        console.error(`❌ User '${targetUsername}' not found.`);
        await app.close();
        process.exit(1);
    }

    console.log(`Found user ${user.username} (ID: ${user.id}). Updating password...`);

    const passwordHash = await argon2.hash(newPassword);

    await db.update(users)
        .set({ passwordHash })
        .where(eq(users.id, user.id));

    console.log('✅ Password updated successfully!');
    console.log(`User: ${targetUsername}`);
    console.log(`New Password: ${newPassword}`);

    await app.close();
}

bootstrap().catch(err => {
    console.error('Failed to reset password:', err);
    process.exit(1);
});
