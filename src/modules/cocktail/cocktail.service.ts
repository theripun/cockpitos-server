import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException, UnprocessableEntityException, Logger } from '@nestjs/common';
import { DrizzleService } from '../../db/drizzle/drizzle.service';
import {
    cocktailDevices, cocktailDeviceSecrets, cocktailEnrollmentTokens, cocktailTasks, cocktailMetricsLatest, cockpitVps, cocktailTransfers, cocktailFsCache, cocktailProcessesLatest,
    CocktailDevice, NewCocktailDevice, NewCocktailDeviceSecret, NewCocktailEnrollmentToken, NewCocktailTask, NewCocktailMetricsLatest,
    CocktailTransfer, NewCocktailTransfer, CocktailFsCache, CocktailProcessesLatest
} from '@/db/drizzle/schema';
import { eq, and, gt, desc, or, isNull, sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { addMinutes, addSeconds, isAfter, isBefore } from 'date-fns';

@Injectable()
export class CocktailService {
    private readonly logger = new Logger(CocktailService.name);
    constructor(private readonly drizzle: DrizzleService) { }

    // --- Agent Authentication ---

    async authenticateAgent(deviceId: string, token: string): Promise<boolean> {
        const db = this.drizzle.db;

        // 1. Check if device exists
        const [device] = await db
            .select()
            .from(cocktailDevices)
            .where(eq(cocktailDevices.id, deviceId))
            .limit(1);

        if (!device) return false;

        // 2. Check Enrollment Token (Fast mechanism used in this project)
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [tokenRow] = await db
            .select()
            .from(cocktailEnrollmentTokens)
            .where(
                and(
                    eq(cocktailEnrollmentTokens.deviceId, deviceId),
                    eq(cocktailEnrollmentTokens.tokenHash, tokenHash),
                    gt(cocktailEnrollmentTokens.expiresAt, new Date()),
                )
            )
            .limit(1);

        if (tokenRow) return true;

        // 3. Check Device Secret (Persistent mechanism)
        const [secret] = await db
            .select()
            .from(cocktailDeviceSecrets)
            .where(eq(cocktailDeviceSecrets.deviceId, deviceId))
            .limit(1);

        if (!secret) return false;

        return argon2.verify(secret.secretHash, token);
    }

    // --- Helpers ---

    private getMasterKey(): Buffer {
        const key = process.env.COCKTAIL_MASTER_KEY || 'default-insecure-master-key-32-bytes!!'; // 32 chars?
        return crypto.createHash('sha256').update(key).digest();
    }

    private encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const key = this.getMasterKey();
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    private decrypt(text: string): string {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const key = this.getMasterKey();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    // --- User Actions ---

    private shellQuote(value: string): string {
        return `'${value.replace(/'/g, `'\\''`)}'`;
    }

    private buildInstallCommand(serverUrl: string, token: string, deviceId: string): string {
        const installUrl = `${serverUrl}/cocktail/install.sh`;

        return [
            `INSTALL_URL=${this.shellQuote(installUrl)};`,
            `SERVER_URL=${this.shellQuote(serverUrl)};`,
            `TOKEN=${this.shellQuote(token)};`,
            `DEVICE_ID=${this.shellQuote(deviceId)};`,
            '(',
            'if command -v curl >/dev/null 2>&1; then',
            '  curl -kfsSL "$INSTALL_URL";',
            'elif command -v wget >/dev/null 2>&1; then',
            '  wget --no-check-certificate -qO- "$INSTALL_URL";',
            'elif command -v python3 >/dev/null 2>&1; then',
            '  python3 -c "import ssl,sys,urllib.request; sys.stdout.write(urllib.request.urlopen(sys.argv[1], context=ssl._create_unverified_context()).read().decode())" "$INSTALL_URL";',
            'else',
            '  echo "No downloader found. Installing curl first..." >&2;',
            '  if command -v apt-get >/dev/null 2>&1; then',
            '    sudo DEBIAN_FRONTEND=noninteractive apt-get update -o DPkg::Lock::Timeout=180 && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -o DPkg::Lock::Timeout=180 curl;',
            '  elif command -v dnf >/dev/null 2>&1; then',
            '    sudo dnf install -y curl;',
            '  elif command -v yum >/dev/null 2>&1; then',
            '    sudo yum install -y curl;',
            '  elif command -v apk >/dev/null 2>&1; then',
            '    sudo apk add curl;',
            '  elif command -v zypper >/dev/null 2>&1; then',
            '    sudo zypper install -y curl;',
            '  else',
            '    echo "No supported package manager found to install curl." >&2;',
            '    exit 1;',
            '  fi;',
            '  curl -kfsSL "$INSTALL_URL";',
            'fi',
            ') | sudo bash -s -- --serverUrl "$SERVER_URL" --token "$TOKEN" --deviceId "$DEVICE_ID"',
        ].join(' ');
    }

    async startEnrollment(userId: string, vpsId: string) {
        const db = this.drizzle.db;

        // 1. Verify VPS verified and belongs to user
        const [vps] = await db
            .select()
            .from(cockpitVps)
            .where(and(eq(cockpitVps.id, vpsId), eq(cockpitVps.userId, userId)))
            .limit(1);

        if (!vps) {
            throw new NotFoundException('VPS not found');
        }
        if (vps.status !== 'verified' && vps.status !== 'agent_installed') {
            if (vps.status !== 'verified' && vps.status !== 'agent_installed') {
                throw new BadRequestException(`VPS must be verified (current status: ${vps.status})`);
            }
        }

        // 2. Ensure device row exists or create
        let [device] = await db
            .select()
            .from(cocktailDevices)
            .where(eq(cocktailDevices.vpsId, vpsId))
            .limit(1);

        if (!device) {
            [device] = await db
                .insert(cocktailDevices)
                .values({
                    userId,
                    vpsId,
                    name: vps.name,
                    status: 'enrolling',
                })
                .returning();
        } else {
            await db
                .update(cocktailDevices)
                .set({ status: 'enrolling', disabledAt: null })
                .where(eq(cocktailDevices.id, device.id));
        }

        // 3. Generate enrollment token
        const tokenRaw = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(tokenRaw).digest('hex');

        await db.insert(cocktailEnrollmentTokens).values({
            tokenHash,
            deviceId: device.id,
            expiresAt: addMinutes(new Date(), 10), // 10 minutes expiry
        });

        // 4. Return
        const serverUrl = process.env.API_PUBLIC_URL || 'https://api.cockpit.run';
        return {
            deviceId: device.id,
            enrollmentToken: tokenRaw,
            expiresAt: addMinutes(new Date(), 10).toISOString(),
            installCommand: this.buildInstallCommand(serverUrl, tokenRaw, device.id),
        };
    }

    async getDevices(userId: string) {
        const db = this.drizzle.db;
        return db
            .select({
                device: cocktailDevices,
                vps: {
                    id: cockpitVps.id,
                    name: cockpitVps.name,
                    host: cockpitVps.host,
                    username: cockpitVps.username,
                }
            })
            .from(cocktailDevices)
            .leftJoin(cockpitVps, eq(cocktailDevices.vpsId, cockpitVps.id))
            .where(eq(cocktailDevices.userId, userId));
    }

    async getDevice(userId: string, deviceId: string) {
        const db = this.drizzle.db;
        const [result] = await db
            .select({
                device: cocktailDevices,
                vps: cockpitVps,
                metrics: cocktailMetricsLatest.metrics
            })
            .from(cocktailDevices)
            .leftJoin(cockpitVps, eq(cocktailDevices.vpsId, cockpitVps.id))
            .leftJoin(cocktailMetricsLatest, eq(cocktailDevices.id, cocktailMetricsLatest.deviceId))
            .where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId)))
            .limit(1);

        if (!result) throw new NotFoundException('Device not found');
        return result;
    }

    async disableDevice(userId: string, deviceId: string) {
        const db = this.drizzle.db;
        const [device] = await db.select().from(cocktailDevices).where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId))).limit(1);

        if (!device) throw new NotFoundException('Device not found');

        await db
            .update(cocktailDevices)
            .set({
                status: 'disabled',
                disabledAt: new Date()
            })
            .where(eq(cocktailDevices.id, deviceId));

        return { success: true };
    }

    async deleteDevice(userId: string, deviceId: string) {
        const db = this.drizzle.db;

        // Verify ownership before deleting
        const [device] = await db
            .select()
            .from(cocktailDevices)
            .where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId)))
            .limit(1);

        if (!device) throw new NotFoundException('Device not found');

        // Hard delete — all child tables cascade automatically (secrets, tokens, metrics, tasks, etc.)
        await db
            .delete(cocktailDevices)
            .where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId)));

        this.logger.log(`Device ${deviceId} permanently deleted by user ${userId}`);
        return { success: true, deleted: deviceId };
    }

    async createTask(userId: string, deviceId: string, type: string, payload: any) {
        const db = this.drizzle.db;
        // Verify owner
        const [device] = await db.select().from(cocktailDevices).where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId))).limit(1);
        if (!device) throw new NotFoundException('Device not found');

        const [task] = await db
            .insert(cocktailTasks)
            .values({
                deviceId,
                type,
                payload,
                status: 'queued',
            })
            .returning();

        return task;
    }

    async listTasks(userId: string, deviceId: string, limit = 50) {
        const db = this.drizzle.db;
        // Verify owner
        const [device] = await db.select().from(cocktailDevices).where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId))).limit(1);
        if (!device) throw new NotFoundException('Device not found');

        return db
            .select()
            .from(cocktailTasks)
            .where(eq(cocktailTasks.deviceId, deviceId))
            .orderBy(desc(cocktailTasks.createdAt))
            .limit(limit);
    }

    async getLatestMetrics(userId: string, deviceId: string) {
        const db = this.drizzle.db;
        // Verify owner
        const [device] = await db.select().from(cocktailDevices).where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId))).limit(1);
        if (!device) throw new NotFoundException('Device not found');

        const [metricsRecord] = await db
            .select()
            .from(cocktailMetricsLatest)
            .where(eq(cocktailMetricsLatest.deviceId, deviceId))
            .limit(1);

        const online = device.lastSeenAt ? (Date.now() - new Date(device.lastSeenAt).getTime() <= 35000) : false;

        return {
            deviceId,
            online,
            lastSeenAt: device.lastSeenAt,
            metricsAt: metricsRecord?.updatedAt,
            ...(metricsRecord?.metrics as any)
        };
    }

    async getProcessList(userId: string, deviceId: string, options: { limit?: number, sort?: string, descending?: boolean }) {
        try {
            const result = (await this.executeTaskSync(userId, deviceId, 'proc.list', options, 15000)) as any;
            if (result && result.items) {
                // Update snapshot
                await this.drizzle.db
                    .insert(cocktailProcessesLatest)
                    .values({
                        deviceId,
                        items: result.items,
                        capturedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: cocktailProcessesLatest.deviceId,
                        set: { items: result.items, capturedAt: new Date(), updatedAt: new Date() }
                    });
                return { ok: true, items: result.items };
            }
            return { ok: false, items: [] };
        } catch (e: any) {
            // Return last snapshot if exists
            const [snap] = await this.drizzle.db
                .select()
                .from(cocktailProcessesLatest)
                .where(eq(cocktailProcessesLatest.deviceId, deviceId))
                .limit(1);

            return {
                ok: false,
                status: 'error',
                error: e.message || 'Timed out waiting for agent',
                stale: !!snap,
                items: snap?.items || []
            };
        }
    }

    async killProcess(userId: string, deviceId: string, pid: number, signal: string, force: boolean) {
        // Validation
        if (pid === 1 && !force) throw new BadRequestException('Cannot kill PID 1 by default');

        // In a real scenario, we'd have a list of protected processes, 
        // but for now we trust the force flag.
        return this.executeTaskSync(userId, deviceId, 'proc.kill', { pid, signal, force }, 10000);
    }

    async runBooster(userId: string, deviceId: string, actions: string[], dryRun: boolean) {
        return this.executeTaskSync(userId, deviceId, 'boost.run', { actions, dryRun }, 15000);
    }

    // --- Agent Actions ---

    async finishEnrollment(dto: { deviceId: string; enrollmentToken: string; agentVersion?: string; os?: string; arch?: string; hostname?: string }) {
        const db = this.drizzle.db;
        const { deviceId, enrollmentToken } = dto;
        const tokenHash = crypto.createHash('sha256').update(enrollmentToken).digest('hex');

        // 1. Verify token
        const [validToken] = await db
            .select()
            .from(cocktailEnrollmentTokens)
            .where(eq(cocktailEnrollmentTokens.tokenHash, tokenHash))
            .limit(1);

        if (!validToken) throw new UnauthorizedException('Invalid token');
        if (validToken.deviceId !== deviceId) throw new UnauthorizedException('Token mismatch');
        // if (validToken.usedAt) throw new UnauthorizedException('Token already used');
        // if (isBefore(validToken.expiresAt, new Date())) throw new UnauthorizedException('Token expired');

        // 2. Mark token used (update timestamp to latest use)
        await db
            .update(cocktailEnrollmentTokens)
            .set({ usedAt: new Date() })
            .where(eq(cocktailEnrollmentTokens.tokenHash, tokenHash));

        // 3. Generate Device Secret
        const secretRaw = crypto.randomBytes(32).toString('hex');
        const secretHash = await argon2.hash(secretRaw);
        const encryptedSecret = this.encrypt(secretRaw);

        // 4. Store secret
        // 4. Store secret (Upsert)
        await db
            .insert(cocktailDeviceSecrets)
            .values({
                deviceId,
                secretHash,
                encryptedSecret,
                isActive: true,
                secretCreatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: cocktailDeviceSecrets.deviceId,
                set: {
                    secretHash,
                    encryptedSecret,
                    isActive: true,
                    secretLastUsedAt: null,
                    secretCreatedAt: new Date()
                }
            });

        // 5. Mark device online
        await db
            .update(cocktailDevices)
            .set({
                status: 'online',
                enrolledAt: new Date(),
                lastSeenAt: new Date(),
                agentVersion: dto.agentVersion,
                os: dto.os,
                arch: dto.arch,
                hostname: dto.hostname,
            })
            .where(eq(cocktailDevices.id, deviceId));

        return { deviceId, deviceSecret: secretRaw };
    }

    async verifyDeviceAuth(deviceId: string, signature: string, ts: string, nonce: string, rawBody: string): Promise<boolean> {
        // Validate TS
        const now = Math.floor(Date.now() / 1000);
        const timestamp = parseInt(ts, 10);
        if (Math.abs(now - timestamp) > 60) {
            return false;
        }

        const db = this.drizzle.db;
        const [secretRec] = await db
            .select()
            .from(cocktailDeviceSecrets)
            .where(and(eq(cocktailDeviceSecrets.deviceId, deviceId), eq(cocktailDeviceSecrets.isActive, true)))
            .limit(1);

        if (!secretRec) return false;

        // Retrieve secret
        let secret = '';
        if (secretRec.encryptedSecret) {
            try {
                secret = this.decrypt(secretRec.encryptedSecret);
            } catch (e) {
                console.error('Failed to decrypt secret', e);
                return false;
            }
        } else {
            console.error('No encrypted secret available for HMAC verification');
            return false;
        }

        let bodyHash = '';
        if (rawBody && rawBody !== '{}') {
            bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
        } else {
            // If body empty, use empty string hash or treat as empty
            // Use crypto hash of empty string if that's the contract
            bodyHash = crypto.createHash('sha256').update('').digest('hex');

            // Wait, if body is '{}', should we hash '{}' or ''?
            // If the user sends {}, hash {}.
            // If the user sends nothing, hash nothing?
            // Controller body usually {} for empty json body.
            // We'll stick to hashing the stringified body.
            if (rawBody === '{}') {
                // Check if actually empty body or {}
                bodyHash = crypto.createHash('sha256').update('{}').digest('hex');
            }
        }

        const payloadToSign = `${ts}.${nonce}.${bodyHash}`;

        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payloadToSign)
            .digest('hex');

        return crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expectedSignature || ''));
    }

    async updateHeartbeat(deviceId: string, body: any) {
        const db = this.drizzle.db;
        // Update last seen
        await db
            .update(cocktailDevices)
            .set({
                lastSeenAt: new Date(),
                status: 'online',
                agentVersion: body.agentVersion
            })
            .where(eq(cocktailDevices.id, deviceId));

        // Update secret last used
        await db
            .update(cocktailDeviceSecrets)
            .set({ secretLastUsedAt: new Date() })
            .where(and(eq(cocktailDeviceSecrets.deviceId, deviceId), eq(cocktailDeviceSecrets.isActive, true)));

        return { status: 'ok' };
    }

    async saveMetrics(deviceId: string, metrics: any) {
        const db = this.drizzle.db;

        try {
            await db.transaction(async (tx) => {
                // Update latest metrics (upsert)
                // On conflict? Postgres supports ON CONFLICT
                await tx
                    .insert(cocktailMetricsLatest)
                    .values({
                        deviceId,
                        metrics,
                        updatedAt: new Date()
                    })
                    .onConflictDoUpdate({
                        target: cocktailMetricsLatest.deviceId,
                        set: { metrics, updatedAt: new Date() }
                    });


                // Update device basics if present (e.g. from metrics payload if it carries host info)
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`[CocktailService] Failed to save metrics for ${deviceId}: ${message}`, stack);
            // Suppress error to avoid 500. Agent will just continue.
            return { success: false, error: message };
        }

        return { success: true };
    }

    async pollTasks(deviceId: string, maxTasks: number = 5) {
        const db = this.drizzle.db;

        return await db.transaction(async (tx) => {
            // Using raw SQL for atomic update + return
            const updatedTasks = await tx.execute(sql`
                UPDATE cocktail_tasks 
                SET status = 'leased', 
                    lease_id = ${crypto.randomBytes(16).toString('hex')}, 
                    leased_at = NOW(), 
                    lease_expires_at = NOW() + INTERVAL '60 seconds'
                WHERE id IN (
                    SELECT id FROM cocktail_tasks 
                    WHERE device_id = ${deviceId} AND (status = 'queued' OR status = 'pending')
                    ORDER BY created_at ASC
                    LIMIT ${maxTasks}
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, type, payload, lease_id as "leaseId"
             `);

            if (updatedTasks.rows.length === 0) return { leaseId: null, tasks: [] };

            const leaseId = updatedTasks.rows[0].leaseId;

            return {
                leaseId,
                tasks: updatedTasks.rows.map(row => ({
                    id: row.id,
                    type: row.type,
                    payload: row.payload
                }))
            };
        });
    }

    async updateTaskStatus(deviceId: string, taskId: string, body: { leaseId: string, status: string, result: any, error: any }) {
        const db = this.drizzle.db;
        const { leaseId, status, result, error } = body;

        const [task] = await db
            .select()
            .from(cocktailTasks)
            .where(eq(cocktailTasks.id, taskId))
            .limit(1);

        if (!task) throw new NotFoundException('Task not found');
        if (task.leaseId !== leaseId) throw new UnauthorizedException('Invalid lease');
        if (task.deviceId !== deviceId) throw new UnauthorizedException('Wrong device');

        await db
            .update(cocktailTasks)
            .set({
                status: status as any,
                result,
                error,
                updatedAt: new Date(),
                leaseId: (status === 'succeeded' || status === 'failed') ? null : leaseId
            })
            .where(eq(cocktailTasks.id, taskId));

        return { success: true };
    }

    // --- Synchronous-ish Task Helper ---

    /**
     * Creates a task and polls for its completion for up to timeoutMs.
     * Returns the result or throws timeout error.
     */
    async executeTaskSync(userId: string, deviceId: string, type: string, payload: any, timeoutMs = 15000) {
        const task = await this.createTask(userId, deviceId, type, payload);
        const startTime = Date.now();
        const pollInterval = 200; // ms

        while (Date.now() - startTime < timeoutMs) {
            const [currentTask] = await this.drizzle.db
                .select()
                .from(cocktailTasks)
                .where(eq(cocktailTasks.id, task.id))
                .limit(1);

            if (currentTask.status === 'succeeded') {
                return currentTask.result;
            }
            if (currentTask.status === 'failed') {
                throw new BadRequestException(`Task failed: ${currentTask.error || 'Unknown error'}`);
            }

            await new Promise(r => setTimeout(r, pollInterval));
        }

        console.warn(`[CocktailService] Task ${task.id} (${type}) timed out after ${timeoutMs}ms waiting for agent ${deviceId}`);
        throw new BadRequestException('Task timed out waiting for agent response');
    }

    // --- Transfers ---

    async initTransfer(userId: string, deviceId: string, type: 'upload' | 'download', path: string, sizeBytes?: number) {
        const db = this.drizzle.db;
        // Verify owner
        const [device] = await db.select().from(cocktailDevices).where(and(eq(cocktailDevices.id, deviceId), eq(cocktailDevices.userId, userId))).limit(1);
        if (!device) throw new NotFoundException('Device not found');

        const [transfer] = await db
            .insert(cocktailTransfers)
            .values({
                userId,
                deviceId,
                type,
                path,
                sizeBytes,
                expiresAt: addMinutes(new Date(), 60), // 1 hour link
            })
            .returning();

        return transfer;
    }

    async getTransferForAgent(transferId: string, deviceId: string) {
        const db = this.drizzle.db;
        const [transfer] = await db
            .select()
            .from(cocktailTransfers)
            .where(eq(cocktailTransfers.id, transferId))
            .limit(1);

        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.deviceId !== deviceId) throw new UnauthorizedException('Wrong device');
        return transfer;
    }

    async getTransferForUser(transferId: string, userId: string) {
        const db = this.drizzle.db;
        const [transfer] = await db
            .select()
            .from(cocktailTransfers)
            .where(eq(cocktailTransfers.id, transferId))
            .limit(1);

        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.userId !== userId) throw new UnauthorizedException('Wrong user');
        return transfer;
    }
    // --- File System Caching ---

    async getFsListCached(userId: string, deviceId: string, path: string, showHidden = false) {
        const db = this.drizzle.db;

        // 1. Check Cache
        const [cache] = await db
            .select()
            .from(cocktailFsCache)
            .where(and(eq(cocktailFsCache.deviceId, deviceId), eq(cocktailFsCache.path, path)))
            .limit(1);

        const isFresh = cache && (Date.now() - new Date(cache.updatedAt).getTime() < 1000 * 60 * 5); // 5 mins fresh

        if (isFresh) {
            // Return from cache immediately, but trigger background refresh
            (this.executeTaskSync(userId, deviceId, 'fs.list', { path, showHidden }) as Promise<any>).then(result => {
                if (result && result.items) {
                    this.updateFsCache(deviceId, path, result.items);
                }
            }).catch(() => { }); // Silently ignore bg refresh errors
            return cache.items;
        }

        // 2. Cache miss or stale -> Go Sync
        const result = (await this.executeTaskSync(userId, deviceId, 'fs.list', { path, showHidden })) as any;
        if (result && result.items) {
            await this.updateFsCache(deviceId, path, result.items);
            return result.items;
        }
        return [];
    }

    private async updateFsCache(deviceId: string, path: string, items: any[]) {
        const db = this.drizzle.db;
        await db
            .insert(cocktailFsCache)
            .values({ deviceId, path, items, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: [cocktailFsCache.deviceId, cocktailFsCache.path],
                set: { items, updatedAt: new Date() }
            });
    }

    async updateTaskStatusSimple(taskId: string, result: any, error: any) {
        const db = this.drizzle.db;
        const [task] = await db
            .select()
            .from(cocktailTasks)
            .where(eq(cocktailTasks.id, taskId))
            .limit(1);

        if (!task) return;

        await db
            .update(cocktailTasks)
            .set({
                status: error ? 'failed' : 'succeeded',
                result,
                error,
                updatedAt: new Date()
            })
            .where(eq(cocktailTasks.id, taskId));
    }

    async updateTaskProgress(taskId: string, progressPct: number, logs?: string) {
        const db = this.drizzle.db;
        await db
            .update(cocktailTasks)
            .set({
                status: 'running',
                updatedAt: new Date(),
                result: { progressPct, logs }
            })
            .where(eq(cocktailTasks.id, taskId));
    }

    async invalidateFsCache(deviceId: string, path: string) {
        const db = this.drizzle.db;
        // Invalidate current folder
        await db.delete(cocktailFsCache)
            .where(and(eq(cocktailFsCache.deviceId, deviceId), eq(cocktailFsCache.path, path)));

        // Also invalidate parent if path is deep
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        if (parentPath !== path) {
            await db.delete(cocktailFsCache)
                .where(and(eq(cocktailFsCache.deviceId, deviceId), eq(cocktailFsCache.path, parentPath)));
        }
    }
}
