import {
    Injectable,
    NotFoundException,
    BadRequestException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from '../../db/drizzle/drizzle.service';
import { cockpitVps, cockpitNotes, users } from '../../db/drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';
import { CreateVpsDto } from './dto/create-vps.dto';
import { UpdateVpsDto } from './dto/update-vps.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import * as crypto from 'crypto';
import { Client } from 'ssh2';

@Injectable()
export class CockpitService {
    private readonly logger = new Logger(CockpitService.name);
    private readonly algorithm = 'aes-256-gcm';

    constructor(
        private readonly drizzle: DrizzleService,
        private readonly configService: ConfigService,
    ) { }

    private getSshAuthType(vps: any): 'password' | 'privateKey' {
        return vps?.meta?.sshAuthType === 'privateKey' ? 'privateKey' : 'password';
    }

    private buildSshAuthConfig(vps: any, secret: string): Record<string, string> {
        const authType = this.getSshAuthType(vps);
        if (authType === 'privateKey') {
            let privateKey = secret;
            let passphrase: string | undefined;
            try {
                const parsed = JSON.parse(secret) as { privateKey?: string; passphrase?: string };
                privateKey = parsed.privateKey || secret;
                passphrase = parsed.passphrase || undefined;
            } catch {
                privateKey = secret;
            }
            return passphrase ? { privateKey, passphrase } : { privateKey };
        }
        return { password: secret };
    }

    // ----------------------------
    // ✅ Postgres-safe sanitizers
    // Postgres cannot store NUL bytes (\u0000) in TEXT/JSON.
    // ----------------------------
    private sanitizeText(value: unknown): string | null {
        if (value === null || value === undefined) return null;

        const s = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);

        // Remove Postgres-illegal NUL byte + trim whitespace
        return s.replace(/\u0000/g, '').trim();
    }

    private sanitizeJson<T>(obj: T): T {
        if (obj === null || obj === undefined) return obj;

        if (typeof obj === 'string') {
            return this.sanitizeText(obj) as unknown as T;
        }

        if (Buffer.isBuffer(obj as any)) {
            return this.sanitizeText(obj) as unknown as T;
        }

        if (Array.isArray(obj)) {
            return obj.map((v) => this.sanitizeJson(v)) as unknown as T;
        }

        if (typeof obj === 'object') {
            const out: any = {};
            for (const [k, v] of Object.entries(obj as any)) {
                out[k] = this.sanitizeJson(v);
            }
            return out;
        }

        return obj;
    }

    private getEncryptionKey(): Buffer {
        const key = this.configService.get<string>('COCKPIT_SECRET_KEY');
        if (!key) {
            this.logger.error('COCKPIT_SECRET_KEY is not configured');
            throw new InternalServerErrorException('COCKPIT_SECRET_KEY is not configured');
        }
        return crypto.createHash('sha256').update(key).digest();
    }

    private encryptSecret(plaintext: string): string {
        const iv = crypto.randomBytes(16);
        const key = this.getEncryptionKey();
        const cipher = crypto.createCipheriv(this.algorithm, key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        const authTag = cipher.getAuthTag().toString('base64');

        return JSON.stringify({
            iv: iv.toString('base64'),
            content: encrypted,
            tag: authTag,
        });
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

    async createVps(userId: string, dto: CreateVpsDto) {
        const authType = dto.authType === 'privateKey' || dto.privateKey ? 'privateKey' : 'password';
        const rawSecret = authType === 'privateKey' ? dto.privateKey : dto.password;

        if (!rawSecret || !rawSecret.trim()) {
            throw new BadRequestException(
                authType === 'privateKey'
                    ? 'Private key is required for key-based SSH authentication'
                    : 'Password is required for password SSH authentication',
            );
        }

        const secret = authType === 'privateKey'
            ? JSON.stringify({ privateKey: rawSecret, passphrase: dto.passphrase || undefined })
            : rawSecret;

        const encryptedPassword = this.encryptSecret(secret);

        const [vps] = await this.drizzle.db
            .insert(cockpitVps)
            .values({
                userId,
                name: dto.name,
                host: dto.host,
                port: dto.port,
                username: dto.username,
                encryptedPassword,
                status: 'pending',
                meta: {
                    sshAuthType: authType,
                },
            })
            .returning();

        this.logger.log(`User ${userId} created VPS ${vps.id}`);

        const { encryptedPassword: _, ...safeVps } = vps;
        return safeVps;
    }

    async findAllVps(userId: string) {
        const list = await this.drizzle.db
            .select()
            .from(cockpitVps)
            .where(eq(cockpitVps.userId, userId))
            .orderBy(desc(cockpitVps.createdAt));

        return list.map((vps) => {
            const { encryptedPassword: _, ...safe } = vps;
            return safe;
        });
    }

    async findOneVps(userId: string, vpsId: string) {
        const [vps] = await this.drizzle.db
            .select()
            .from(cockpitVps)
            .where(and(eq(cockpitVps.id, vpsId), eq(cockpitVps.userId, userId)));

        if (!vps) {
            throw new NotFoundException('VPS not found');
        }

        const { encryptedPassword: _, ...safe } = vps;
        return safe;
    }

    async updateVps(userId: string, vpsId: string, dto: UpdateVpsDto) {
        const [existing] = await this.drizzle.db
            .select()
            .from(cockpitVps)
            .where(and(eq(cockpitVps.id, vpsId), eq(cockpitVps.userId, userId)));

        if (!existing) {
            throw new NotFoundException('VPS not found');
        }

        const updates: Partial<typeof cockpitVps.$inferInsert> = {
            updatedAt: new Date(),
        };

        if (dto.name) updates.name = dto.name;

        let connectionChanged = false;
        let hostChanged = false;

        if (dto.host && dto.host !== existing.host) {
            updates.host = dto.host;
            connectionChanged = true;
            hostChanged = true;
        }
        if (dto.port && dto.port !== existing.port) {
            updates.port = dto.port;
            connectionChanged = true;
        }
        if (dto.username && dto.username !== existing.username) {
            updates.username = dto.username;
            connectionChanged = true;
        }
        const nextAuthType = dto.authType === 'privateKey' || dto.privateKey ? 'privateKey' : dto.authType === 'password' || dto.password ? 'password' : this.getSshAuthType(existing);
        const nextSecret = nextAuthType === 'privateKey' && dto.privateKey
            ? JSON.stringify({ privateKey: dto.privateKey, passphrase: dto.passphrase || undefined })
            : dto.password;
        if (nextSecret) {
            updates.encryptedPassword = this.encryptSecret(nextSecret);
            updates.meta = {
                ...(existing.meta as Record<string, unknown> | null ?? {}),
                sshAuthType: nextAuthType,
            };
            connectionChanged = true;
        }

        if (connectionChanged) {
            updates.status = 'pending';
            updates.verifiedAt = null;
            updates.lastError = null;

            if (hostChanged) {
                updates.serverFingerprint = null;
                updates.meta = null;
            }
        }

        const [updated] = await this.drizzle.db
            .update(cockpitVps)
            .set(updates)
            .where(eq(cockpitVps.id, vpsId))
            .returning();

        this.logger.log(`User ${userId} updated VPS ${vpsId}`);

        const { encryptedPassword: _, ...safe } = updated;
        return safe;
    }

    async deleteVps(userId: string, vpsId: string) {
        const [deleted] = await this.drizzle.db
            .delete(cockpitVps)
            .where(and(eq(cockpitVps.id, vpsId), eq(cockpitVps.userId, userId)))
            .returning();

        if (!deleted) {
            throw new NotFoundException('VPS not found');
        }

        this.logger.log(`User ${userId} deleted VPS ${vpsId}`);
        return { ok: true };
    }

    async acceptHostKey(userId: string, vpsId: string, fingerprint: string) {
        const [vps] = await this.drizzle.db
            .select()
            .from(cockpitVps)
            .where(and(eq(cockpitVps.id, vpsId), eq(cockpitVps.userId, userId)));

        if (!vps) {
            throw new NotFoundException('VPS not found');
        }

        await this.drizzle.db
            .update(cockpitVps)
            .set({
                serverFingerprint: fingerprint,
                status: 'pending', // Reset status as verified=false until next verify
                lastError: null,
            })
            .where(eq(cockpitVps.id, vpsId));

        this.logger.log(`User ${userId} accepted new host key for VPS ${vpsId}: ${fingerprint}`);

        return { ok: true };
    }

    async verifyVps(userId: string, vpsId: string) {
        const [vps] = await this.drizzle.db
            .select()
            .from(cockpitVps)
            .where(and(eq(cockpitVps.id, vpsId), eq(cockpitVps.userId, userId)));

        if (!vps) {
            throw new NotFoundException('VPS not found');
        }

        this.logger.log(`User ${userId} verifying VPS ${vpsId} (${vps.host}:${vps.port})`);

        const password = this.decryptSecret(vps.encryptedPassword);

        try {
            return await this.testSshConnection(userId, vpsId, vps, password, vps.port, true);
        } catch (error: any) {
            const errCode = error?.response?.code || error?.code;

            // Define what constitutes a network error warranting a probe
            const isNetworkError =
                errCode === 'SSH_CONNECTION_FAILED' ||
                errCode === 'SSH_TIMEOUT' ||
                errCode === 'ECONNREFUSED' ||
                errCode === 'ETIMEDOUT';

            // Do not probe if auth failed on the main port
            const isAuthError = errCode === 'SSH_AUTH_FAILED';

            if (isNetworkError && !isAuthError) {
                const commonPorts = [22, 2222, 2022, 22022, 22222];
                // Filter out the port we already tried
                const portsToProbe = commonPorts.filter(p => p !== vps.port);

                for (const p of portsToProbe) {
                    try {
                        // 🛑 Wait 1s between probes to avoid triggering 'MaxStartups'
                        await new Promise((resolve) => setTimeout(resolve, 1000));

                        // Probe with short timeout (5s), NO DB update
                        await this.testSshConnection(userId, vpsId, vps, password, p, false, 5000);

                        // If success (or at least reachable), we stop and suggest this port.
                        throw new BadRequestException({
                            code: 'SSH_PORT_MISMATCH',
                            message: `SSH is reachable on port ${p}. Update the port and retry.`,
                            suggestedPorts: [p]
                        });
                    } catch (probeErr: any) {
                        // If it's our BadRequestException (success signal), propagate it up
                        if (probeErr instanceof BadRequestException) {
                            const response = probeErr.getResponse() as any;
                            if (response.code === 'SSH_PORT_MISMATCH') {
                                throw probeErr;
                            }
                        }

                        // If authentication failed on the probed port, that means IT IS an SSH port!
                        const probeCode = probeErr?.response?.code || probeErr?.code;
                        if (probeCode === 'SSH_AUTH_FAILED' || probeCode === 'HOST_KEY_CHANGED') {
                            throw new BadRequestException({
                                code: 'SSH_PORT_MISMATCH',
                                message: `SSH is reachable on port ${p}. Update the port and retry.`,
                                suggestedPorts: [p]
                            });
                        }

                        // Otherwise (still network error), continue probing
                    }
                }
            }

            // If no probe outcome found, throw original error
            throw error;
        }
    }

    private async testSshConnection(
        userId: string,
        vpsId: string,
        vps: any,
        password: string,
        port: number,
        updateDb: boolean,
        timeout: number = 28000
    ) {
        return new Promise((resolve, reject) => {
            const conn = new Client();
            let fingerprint: string | null = null;
            let meta: any = {};
            let errorRecorded = false;
            let hostKeyMismatch = false;

            const cleanup = () => {
                try {
                    conn.end();
                } catch { }
            };

            const handleError = async (code: string, message: string, details?: any) => {
                if (errorRecorded) return;
                errorRecorded = true;

                const safeMessage = this.sanitizeText(message) ?? 'Unknown error';

                if (updateDb) {
                    this.logger.warn(`VPS ${vpsId} verification failed: [${code}] ${safeMessage}`);

                    try {
                        await this.drizzle.db
                            .update(cockpitVps)
                            .set({
                                status: 'failed',
                                lastError: this.sanitizeText(`[${code}] ${safeMessage}`),
                            })
                            .where(eq(cockpitVps.id, vpsId));
                    } catch (dbErr) {
                        this.logger.error('Failed to persist verification error', dbErr as any);
                    }
                }

                cleanup();

                reject(
                    new BadRequestException({
                        code,
                        message: safeMessage,
                        vpsId,
                        ...details
                    }),
                );
            };

            conn
                .on('ready', () => {
                    const cmd =
                        'whoami && hostname && uname -m && uname -r && (cat /etc/os-release || echo "PRETTY_NAME=Unknown")';

                    conn.exec(cmd, (err, stream) => {
                        if (err) {
                            handleError('EXEC_FAILED', err.message);
                            return;
                        }

                        let output = '';
                        stream.on('data', (data: any) => {
                            output += Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
                        });

                        stream.on('close', async () => {
                            try {
                                const cleanedOutput = this.sanitizeText(output) ?? '';
                                const lines = cleanedOutput.split('\n');

                                const whoami = this.sanitizeText(lines[0]);
                                const hostname = this.sanitizeText(lines[1]);
                                const arch = this.sanitizeText(lines[2]);
                                const kernel = this.sanitizeText(lines[3]);

                                const osRelease = lines.slice(4).join('\n');
                                const prettyNameMatch = osRelease.match(/PRETTY_NAME="?([^"\n]+)"?/);
                                const osPretty = this.sanitizeText(prettyNameMatch ? prettyNameMatch[1] : 'Unknown');

                                meta = this.sanitizeJson({
                                    whoami,
                                    hostname,
                                    arch,
                                    kernel,
                                    os: osPretty,
                                    sshAuthType: this.getSshAuthType(vps),
                                });

                                if (updateDb) {
                                    this.logger.log(`VPS ${vpsId} verified successfully. Hostname: ${hostname ?? 'unknown'}`);

                                    await this.drizzle.db
                                        .update(cockpitVps)
                                        .set({
                                            status: 'verified',
                                            verifiedAt: new Date(),
                                            lastError: null,
                                            serverFingerprint: fingerprint,
                                            meta: meta,
                                        })
                                        .where(eq(cockpitVps.id, vpsId));
                                }

                                resolve({
                                    ok: true,
                                    status: 'verified',
                                    fingerprint,
                                    remote: meta,
                                });

                                cleanup();
                            } catch (e: any) {
                                handleError('VERIFY_PARSE_OR_DB_FAILED', e?.message ?? 'Failed to verify');
                            }
                        });

                        stream.stderr?.on('data', (data: any) => {
                            // optional debug
                        });
                    });
                })
                .on('banner', (msg) => {
                    // Detect server-side rejection banners (e.g. MaxStartups)
                    if (msg.includes('Exceeded MaxStartups')) {
                        handleError('SSH_SERVER_BUSY', 'Server is busy (MaxStartups exceeded). Please wait a moment and try again.');
                        conn.end();
                    }
                })
                .on('error', (err: any) => {
                    // If host key mismatch triggered, return that explicitly
                    if (hostKeyMismatch) {
                        handleError('HOST_KEY_CHANGED', 'Remote host key has changed! Security warning.', {
                            storedFingerprint: vps.serverFingerprint,
                            newFingerprint: fingerprint
                        });
                        return;
                    }

                    let code = 'SSH_CONNECTION_FAILED';
                    const rawMessage = err?.message || 'SSH connection failed';
                    let message = rawMessage;

                    if (err?.level === 'client-timeout') {
                        code = 'SSH_TIMEOUT';
                        message = 'Connection timed out while waiting for server response.';
                    } else if (rawMessage.includes('authentication')) {
                        code = 'SSH_AUTH_FAILED';
                        message = this.getSshAuthType(vps) === 'privateKey'
                            ? 'Authentication failed. Please check your username, private key, and optional passphrase.'
                            : 'Authentication failed. Please check your username and password.';
                    } else if (rawMessage.includes('Connection lost before handshake')) {
                        code = 'SSH_HANDSHAKE_LOST';
                        message = 'Connection lost before handshake. The server might be busy or blocking the connection.';
                    } else if (err?.code === 'ECONNREFUSED') {
                        code = 'ECONNREFUSED';
                        message = `Connection refused at ${vps.host}:${port}. Is SSH running?`;
                    } else if (err?.code === 'ETIMEDOUT') {
                        code = 'ETIMEDOUT';
                        message = `Network timeout reaching ${vps.host}. Check your firewall or IP.`;
                    } else {
                        // For other errors, prefix with the code if available but keep the "real" message
                        message = err?.code ? `[${err.code}] ${rawMessage}` : rawMessage;
                    }

                    handleError(code, message, { rawError: rawMessage });
                });

            const config: any = {
                host: vps.host,
                port: port, // Use dynamic port
                username: vps.username,
                ...this.buildSshAuthConfig(vps, password),
                readyTimeout: timeout, // Use dynamic timeout
                handshakeTimeout: timeout, // Match handshake timeout

                // ✅ force ssh2 to give us a stable host key hash
                hostHash: 'sha256',
            };


            // ✅ MUST be synchronous — do not await inside hostVerifier
            config.hostVerifier = (hash: string) => {
                // hash should now be stable (sha256) from ssh2
                const safeHash = this.sanitizeText(hash) ?? '';
                let base64Hash = safeHash;

                // If ssh2 returns hex sometimes, convert to base64
                const looksHex = /^[0-9a-f]+$/i.test(safeHash) && safeHash.length >= 32;
                if (looksHex) {
                    base64Hash = Buffer.from(safeHash, 'hex').toString('base64');
                }

                fingerprint = `SHA256:${base64Hash}`;

                // Only check match if updating (main flow), or if we care about MITM during probe?
                // For probe, we really just want to know if it's there.
                // But staying safe is better. If mismatched during probe, technically it IS reachable.
                if (updateDb && vps.serverFingerprint && vps.serverFingerprint !== fingerprint) {
                    this.logger.warn(
                        `VPS ${vpsId} host key mismatch! Stored: ${vps.serverFingerprint}, Received: ${fingerprint}`,
                    );
                    hostKeyMismatch = true;
                    return false;
                }

                return true;
            };


            try {
                conn.connect(config);
            } catch (err: any) {
                handleError('SSH_CONNECT_ERROR', err?.message ?? 'SSH connect error');
            }
        });
    }

    // ----------------------------
    // ✅ Notes Logic
    // ----------------------------

    async createNote(userId: string, dto: CreateNoteDto) {
        const [note] = await this.drizzle.db
            .insert(cockpitNotes)
            .values({
                userId,
                title: dto.title,
                content: dto.content ?? '',
            })
            .returning();

        this.logger.log(`User ${userId} created note ${note.id}`);
        return note;
    }

    async findAllNotes(userId: string) {
        return this.drizzle.db
            .select()
            .from(cockpitNotes)
            .where(eq(cockpitNotes.userId, userId))
            .orderBy(desc(cockpitNotes.updatedAt));
    }

    async findOneNote(userId: string, noteId: string) {
        const [note] = await this.drizzle.db
            .select()
            .from(cockpitNotes)
            .where(and(eq(cockpitNotes.id, noteId), eq(cockpitNotes.userId, userId)));

        if (!note) {
            throw new NotFoundException('Note not found');
        }

        return note;
    }

    async updateNote(userId: string, noteId: string, dto: UpdateNoteDto) {
        const updates: any = {
            updatedAt: new Date(),
        };

        if (dto.title !== undefined) updates.title = dto.title;
        if (dto.content !== undefined) updates.content = dto.content;

        const [updated] = await this.drizzle.db
            .update(cockpitNotes)
            .set(updates)
            .where(and(eq(cockpitNotes.id, noteId), eq(cockpitNotes.userId, userId)))
            .returning();

        if (!updated) {
            throw new NotFoundException('Note not found');
        }

        this.logger.log(`User ${userId} updated note ${noteId}`);
        return updated;
    }

    async deleteNote(userId: string, noteId: string) {
        const [deleted] = await this.drizzle.db
            .delete(cockpitNotes)
            .where(and(eq(cockpitNotes.id, noteId), eq(cockpitNotes.userId, userId)))
            .returning();

        if (!deleted) {
            throw new NotFoundException('Note not found');
        }

        this.logger.log(`User ${userId} deleted note ${noteId}`);
        return { ok: true };
    }

    // ----------------------------
    // ✅ Wallpaper Logic
    // ----------------------------

    async getWallpaper(userId: string) {
        const [user] = await this.drizzle.db
            .select({ wallpaperId: users.wallpaperId })
            .from(users)
            .where(eq(users.id, userId));

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return { wallpaperId: user.wallpaperId ?? 11 };
    }

    async updateWallpaper(userId: string, wallpaperId: number) {
        const [updated] = await this.drizzle.db
            .update(users)
            .set({ wallpaperId: wallpaperId, updatedAt: new Date() })
            .where(eq(users.id, userId))
            .returning({ wallpaperId: users.wallpaperId });

        if (!updated) {
            throw new NotFoundException('User not found');
        }

        this.logger.log(`User ${userId} updated wallpaper to ${wallpaperId}`);
        return updated;
    }
}
