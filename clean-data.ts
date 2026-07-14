
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { DrizzleService } from 'src/db/drizzle/drizzle.service';
import { sql } from 'drizzle-orm';

async function bootstrap() {
    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const drizzle = app.get(DrizzleService);
    const db = drizzle.db;

    console.log('Cleaning database...');

    try {
        // Truncate all tables in the public schema
        await db.execute(sql.raw(`
            DO $$ DECLARE
                r RECORD;
            BEGIN
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                    EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
            END $$;
        `));
        console.log('✅ Database cleaned successfully');
    } catch (error) {
        console.error('❌ Error cleaning database:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

bootstrap();
