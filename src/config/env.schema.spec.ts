import { envSchema } from './env.schema';

const validEnv = {
    NODE_ENV: 'production',
    PORT: '9100',
    DATABASE_URL: 'postgres://cockpit_user:password@localhost:5432/cockpit_pro',
    R2_ACCOUNT_ID: 'account-id',
    R2_ACCESS_KEY_ID: 'access-key-id',
    R2_SECRET_ACCESS_KEY: 'secret-access-key',
    R2_BUCKET: 'cockpit-preview',
    COCKPIT_SECRET_KEY: 'a'.repeat(32),
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user@example.com',
    SMTP_PASS: 'password',
    FROM_EMAIL: 'noreply@example.com',
};

describe('envSchema', () => {
    it('accepts a localhost PostgreSQL URL in production for self-hosted deployments', () => {
        const result = envSchema.safeParse(validEnv);

        expect(result.success).toBe(true);
    });

    it('still rejects malformed database URLs', () => {
        const result = envSchema.safeParse({
            ...validEnv,
            DATABASE_URL: 'not-a-url',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.flatten().fieldErrors.DATABASE_URL).toBeDefined();
        }
    });

    it('includes the www production frontend in the default CORS origins', () => {
        const result = envSchema.safeParse({
            ...validEnv,
            CORS_ORIGIN: undefined,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.CORS_ORIGIN.split(',')).toContain('https://www.cockpit.run');
        }
    });
});
