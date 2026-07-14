import {
    Injectable,
    NotFoundException,
    BadRequestException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from '../../../db/drizzle/drizzle.service';
import { cockpitVps, cockpitTerminalSessions } from '../../../db/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { Client } from 'ssh2';

@Injectable()
export class CockpitTerminalService {
    private readonly logger = new Logger(CockpitTerminalService.name);
    private readonly algorithm = 'aes-256-gcm';

    constructor(
        private readonly drizzle: DrizzleService,
        private readonly configService: ConfigService,
    ) { }

    private getEncryptionKey(): Buffer {
        const key = this.configService.get<string>('COCKPIT_SECRET_KEY');
        if (!key) {
            this.logger.error('COCKPIT_SECRET_KEY is not configured');
            throw new InternalServerErrorException('COCKPIT_SECRET_KEY is not configured');
        }
        return crypto.createHash('sha256').update(key).digest();
    }

    private decryptSecret(encryptedPayload: string): string {
        try {
            const { iv, content, tag } = JSON.parse(encryptedPayload);
            const key = this.getEncryptionKey();
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                key,
                Buffer.from(iv, 'base64'),
            );

            decipher.setAuthTag(Buffer.from(tag, 'base64'));

            let decrypted = decipher.update(content, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            this.logger.error('Failed to decrypt secret', error as any);
            throw new InternalServerErrorException('Failed to decrypt secret');
        }
    }

    async createSession(userId: string, vpsId: string) {
        // 1. Verify VPS exists and belongs to user
        const [vps] = await this.drizzle.db
            .select()
            .from(cockpitVps)
            .where(and(eq(cockpitVps.id, vpsId), eq(cockpitVps.userId, userId)));

        if (!vps) {
            throw new NotFoundException('VPS not found');
        }

        // 2. Verify VPS is verified
        if (vps.status !== 'verified') {
            throw new BadRequestException({
                code: 'VPS_NOT_VERIFIED',
                message: 'VPS must be verified before opening a terminal session.',
            });
        }

        // 3. Create Session Record
        // Set expiry to 10 minutes from now (for initial connection window)
        // Adjust as seen fit. User suggested "createdAt" + "expiresAt" logic.
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10m

        let sessionId: string;

        const [session] = await this.drizzle.db
            .insert(cockpitTerminalSessions)
            .values({
                userId,
                vpsId,
                status: 'created',
                expiresAt,
            })
            .returning();
        sessionId = session.id;

        // Return session info
        return {
            sessionId,
            wsUrl: `/cockpit/terminal/ws/${sessionId}`,
            vps, // Internal use
        };
    }

    async getVpsCredentials(sessionId: string, userId: string) {
        // Retrieve session and VPS info.
        // We need to join or look up.

        let session;
        try {
            const result = await this.drizzle.db
                .select()
                .from(cockpitTerminalSessions)
                .where(and(eq(cockpitTerminalSessions.id, sessionId), eq(cockpitTerminalSessions.userId, userId)));
            session = result[0];
        } catch (e) {
            // If DB failed, we can't really proceed securely unless we have in-memory store.
            // Assuming DB works for now or this is the check.
        }

        if (!session) {
            // If we used a fallback ID, we won't find it here. 
            // Ideally we shouldn't use fallback ID if we can't store state.
            // But if specific requirement allows in-memory...
            // For now, return null to fail the connection if not found.
            return null;
        }

        if (session.status === 'closed' || session.status === 'failed') {
            return null;
        }

        if (session.expiresAt && new Date() > session.expiresAt && session.status === 'created') {
            // Expired before connect
            return null;
        }

        const [vps] = await this.drizzle.db
            .select()
            .from(cockpitVps)
            .where(eq(cockpitVps.id, session.vpsId));

        if (!vps) return null;

        const meta = (vps.meta ?? {}) as Record<string, unknown>;
        const sshAuthType = meta.sshAuthType === 'privateKey' ? 'privateKey' : 'password';
        const secret = this.decryptSecret(vps.encryptedPassword);
        let privateKey = secret;
        let passphrase: string | undefined;

        if (sshAuthType === 'privateKey') {
            try {
                const parsed = JSON.parse(secret) as { privateKey?: string; passphrase?: string };
                privateKey = parsed.privateKey || secret;
                passphrase = parsed.passphrase || undefined;
            } catch {
                privateKey = secret;
            }
        }

        return {
            ...vps,
            sshAuthType,
            password: sshAuthType === 'password' ? secret : undefined,
            privateKey: sshAuthType === 'privateKey' ? privateKey : undefined,
            passphrase,
        };
    }

    async markConnected(sessionId: string) {
        try {
            await this.drizzle.db
                .update(cockpitTerminalSessions)
                .set({
                    status: 'connected',
                    connectedAt: new Date(),
                })
                .where(eq(cockpitTerminalSessions.id, sessionId));
        } catch (e) {
            // ignore
        }
    }

    async markClosed(sessionId: string) {
        try {
            await this.drizzle.db
                .update(cockpitTerminalSessions)
                .set({
                    status: 'closed',
                    closedAt: new Date(),
                })
                .where(eq(cockpitTerminalSessions.id, sessionId));
        } catch (e) {
            // ignore
        }
    }
}
