import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
    private pool: Pool;
    private _db: NodePgDatabase<typeof schema>;

    constructor(private readonly configService: ConfigService) {
        const databaseUrl = this.configService.get<string>('DATABASE_URL');

        this.pool = new Pool({
            connectionString: databaseUrl,
        });

        this._db = drizzle(this.pool, { schema });
    }

    get db(): NodePgDatabase<typeof schema> {
        return this._db;
    }

    async onModuleInit(): Promise<void> {
        // Test connection
        try {
            await this.pool.query('SELECT 1');
            console.log('✅ Database connected successfully');
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
        console.log('Database connection closed');
    }
}
