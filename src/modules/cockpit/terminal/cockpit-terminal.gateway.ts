import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { Logger } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { parse } from 'cookie';
import { CockpitTerminalService } from './cockpit-terminal.service';
import { DrizzleService } from '../../../db/drizzle/drizzle.service';
import { sessions, users } from '../../../db/drizzle/schema';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { Client } from 'ssh2';
import { COOKIE_NAMES } from '../../../platform/security/cookies/cookie.constants';

@WebSocketGateway({
    path: '/cockpit/terminal/ws',
    transports: ['websocket'],
    cors: {
        origin: true, // Allow all origins for now, or fetch from config
        credentials: true,
    },
})
export class CockpitTerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(CockpitTerminalGateway.name);

    constructor(
        private readonly terminalService: CockpitTerminalService,
        private readonly drizzle: DrizzleService,
    ) { }

    async handleConnection(client: WebSocket, request: IncomingMessage) {
        this.logger.log(`Client connecting... IP: ${request.socket.remoteAddress}`);
        this.logger.log(`Headers: ${JSON.stringify(request.headers)}`);
        this.logger.log(`URL: ${request.url}`);

        try {
            // 1. Extract and validate session cookie
            const cookieHeader = request.headers.cookie || '';
            this.logger.log(`Cookie Header: ${cookieHeader}`);

            const cookies = parse(cookieHeader);
            let userSessionId = cookies[COOKIE_NAMES.SESSION];

            // 1b. Helper to parse query params
            const urlObj = new URL(request.url || '', 'http://localhost');
            const queryParams = urlObj.searchParams;

            // Fallback: Check query param 'sessionId' in URL for USER session
            if (!userSessionId) {
                userSessionId = queryParams.get('sessionId') || undefined;
            }

            if (!userSessionId) {
                this.logger.warn('Connection attempt without session cookie or query param');
                client.close(1008, 'Authentication required');
                return;
            }

            // 2. Validate User Session from DB
            const [userSession] = await this.drizzle.db
                .select()
                .from(sessions)
                .where(
                    and(
                        eq(sessions.id, userSessionId),
                        isNull(sessions.revokedAt),
                        gt(sessions.expiresAt, new Date())
                    )
                );

            if (!userSession) {
                this.logger.warn(`Invalid session ID: ${userSessionId}`);
                client.close(1008, 'Invalid session');
                return;
            }

            // 3. Extract Terminal Session ID from Query Param
            // We use 'id' or 'terminalId' param
            const terminalSessionId = queryParams.get('id');

            if (!terminalSessionId) {
                this.logger.warn('Missing terminal session ID in query params');
                client.close(1008, 'Missing terminal session ID');
                return;
            }

            // 4. Get VPS Credentials & Validate Ownership
            const vpsConfig = await this.terminalService.getVpsCredentials(terminalSessionId, userSession.userId);

            if (!vpsConfig) {
                this.logger.warn(`Terminal session not found or unauthorized: ${terminalSessionId} for user ${userSession.userId}`);
                client.close(1008, 'Session not found or expired');
                return;
            }

            // 5. Connect SSH
            const cwd = queryParams.get('cwd');
            this.logger.log(`Starting SSH connection for session ${terminalSessionId} to ${vpsConfig.host} (CWD: ${cwd || 'default'})`);
            this.handleSshConnection(client, vpsConfig, terminalSessionId, cwd);

            // 6. Mark as connected
            await this.terminalService.markConnected(terminalSessionId);

        } catch (error) {
            this.logger.error('Connection handling error', error);
            try {
                client.send(JSON.stringify({ type: 'error', message: 'Internal server error during connection setup' }));
            } catch { }
            client.close(1011, 'Internal server error');
        }
    }

    handleDisconnect(client: WebSocket) {
        // Cleanup is handled in handleSshConnection's close listeners
    }

    private handleSshConnection(client: WebSocket, vps: any, sessionId: string, cwd?: string | null) {
        const conn = new Client();
        let stream: any = null;

        // Cleanup function
        const cleanup = () => {
            try {
                if (stream) stream.end();
            } catch { }
            try {
                conn.end();
            } catch { }
            try {
                this.terminalService.markClosed(sessionId);
            } catch { }
        };

        client.on('close', () => {
            cleanup();
        });

        client.on('message', (data) => {
            try {
                // Determine if binary or text. We expect JSON control messages or raw input?
                // Requirements say: "Use JSON messages for control + raw text frames for input (or keep all JSON)."
                // Requirements also say: "Recommended WS message design: { type: ..., ... }"
                // So we will try to parse JSON.

                const msg = JSON.parse(data.toString());

                if (msg.type === 'init') {
                    // Handled in shell start usually, but we can resize if needed
                    if (stream) {
                        stream.setWindow(msg.rows, msg.cols, 0, 0);
                    }
                } else if (msg.type === 'resize') {
                    if (stream) {
                        stream.setWindow(msg.rows, msg.cols, 0, 0);
                    }
                } else if (msg.type === 'input') {
                    if (stream) {
                        stream.write(msg.data);
                    }
                } else if (msg.type === 'ping') {
                    client.send(JSON.stringify({ type: 'pong' }));
                }

            } catch (e) {
                // If not JSON, assumme raw input? The strict requirements say "Protocol (must be stable)... Use JSON messages".
                // We should strictly follow the JSON protocol to be safe and avoid ambiguity.
                this.logger.warn('Received non-JSON message from client', e);
            }
        });

        conn.on('ready', () => {
            client.send(JSON.stringify({ type: 'ready' }));

            conn.shell({ term: 'xterm-256color' }, (err, s) => {
                if (err) {
                    client.send(JSON.stringify({ type: 'error', code: 'SHELL_ERROR', message: err.message }));
                    conn.end();
                    return;
                }

                stream = s;

                // Set initial working directory if provided
                if (cwd) {
                    // We use a small delay to ensure the shell prompt is ready, 
                    // though for many shells we can just fire it immediately.
                    // Using cd with quotes for safety.
                    stream.write(`cd "${cwd}" && clear\n`);
                }

                // Send output to client
                stream.on('data', (d: Buffer) => {
                    client.send(JSON.stringify({ type: 'output', data: d.toString('utf8') }));
                });

                stream.on('close', () => {
                    client.send(JSON.stringify({ type: 'exit', code: 0 }));
                    conn.end();
                    client.close();
                });
            });
        });

        conn.on('error', (err: any) => {
            this.logger.error(`SSH Error for session ${sessionId}: ${err.message}`);
            try {
                client.send(JSON.stringify({ type: 'error', message: `SSH Connection Error: ${err.message}` }));
            } catch { }
            conn.end();
            client.close();

            // Check for Host Key Mismatch (captured in hostVerifier usually)
            // But ssh2 emits specific errors sometimes.
            // We can rely on logic in verifying?
            // Actually, verify step happens BEFORE this method called by user (POST /create).
            // But we DO need to verify AGAIN because we are making a NEW connection.
            // The vpsConfig should contain the stored fingerprint.
        });

        conn.on('close', () => {
            client.close();
            this.terminalService.markClosed(sessionId);
        });

        try {
            const authConfig = vps.sshAuthType === 'privateKey'
                ? {
                    privateKey: vps.privateKey,
                    ...(vps.passphrase ? { passphrase: vps.passphrase } : {}),
                }
                : { password: vps.password };

            conn.connect({
                host: vps.host,
                port: Number(vps.port),
                username: vps.username,
                ...authConfig,
                readyTimeout: 30000,
                // Match cockpit.service.ts config exactly (removed keepalive)
                hostHash: 'sha256',
                hostVerifier: (hash: string) => {
                    // 1. Sanitize
                    const safeHash = hash ? hash.trim() : '';
                    let base64Hash = safeHash;

                    // 2. Convert Hex to Base64 if needed (ssh2 usually returns hex with hostHash: 'sha256')
                    const looksHex = /^[0-9a-f]+$/i.test(safeHash) && safeHash.length >= 32;
                    if (looksHex) {
                        try {
                            base64Hash = Buffer.from(safeHash, 'hex').toString('base64');
                        } catch { } // keep original on error
                    }

                    const fingerprint = `SHA256:${base64Hash}`;

                    // 3. Strict Host Key Check (only if we have a stored fingerprint)
                    if (vps.serverFingerprint && vps.serverFingerprint !== fingerprint) {
                        client.send(JSON.stringify({
                            type: 'error',
                            code: 'HOST_KEY_CHANGED',
                            message: 'Remote host key has changed!',
                            storedFingerprint: vps.serverFingerprint,
                            newFingerprint: fingerprint
                        }));
                        return false;
                    }
                    return true;
                }
            });
        } catch (err) {
            client.send(JSON.stringify({ type: 'error', message: 'Connection failed' }));
            client.close();
        }
    }
}
