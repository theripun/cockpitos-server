
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { DrizzleService } from 'src/db/drizzle/drizzle.service';
import { sql } from 'drizzle-orm';

type TableCount = {
    table_name: string;
    row_count: string;
};

async function bootstrap() {
    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const drizzle = app.get(DrizzleService);
    const db = drizzle.db;

    console.log('Preparing complete database clean...');

    try {
        const tableCounts = await db.execute<TableCount>(sql.raw(`
            SELECT
                tablename AS table_name,
                (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text AS row_count
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        `));
        const rows = Array.from(tableCounts.rows);
        const subscriptionRows = rows.find(row => row.table_name === 'user_subscriptions')?.row_count ?? '0';

        console.log(`Found ${rows.length} public tables to clean.`);
        console.log(`Plan/subscription rows queued for clean: ${subscriptionRows}`);

        if (rows.length === 0) {
            console.log('No public tables found. Nothing to clean.');
            return;
        }

        // Truncate every application table in the connected database's public schema.
        // This includes user_subscriptions, so all users return to Free/no-plan state.
        await db.execute(sql.raw(`
            DO $$ DECLARE
                r RECORD;
            BEGIN
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                    EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', 'public', r.tablename);
                END LOOP;
            END $$;
        `));
        console.log('✅ Database cleaned successfully, including all plan/subscription data');
    } catch (error) {
        console.error('❌ Error cleaning database:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

bootstrap();
