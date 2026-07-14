import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { parse } from 'cookie';
import { COOKIE_NAMES } from '../../platform/security/cookies/cookie.constants';
import { DrizzleService } from '../../db/drizzle/drizzle.service';
import { sessions } from '../../db/drizzle/schema';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { CocktailWsHub, AgentSocket, UiSocket } from './cocktail-ws-hub.service';
import { CocktailService } from './cocktail.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    path: '/cockpit/cocktail/ws/agent',
    transports: ['websocket'],
})
export class CocktailAgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(CocktailAgentGateway.name);

    constructor(
        private readonly hub: CocktailWsHub,
        private readonly cocktailService: CocktailService,
    ) { }

    async handleConnection(client: AgentSocket, request: IncomingMessage) {
        client.isAlive = true;
        client.on('pong', () => (client.isAlive = true));

        client.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.t === 'hello') {
                    const { deviceId, token } = msg;
                    if (!deviceId || !token) {
                        client.send(JSON.stringify({ t: 'err', code: 'BAD_HELLO', message: 'Missing deviceId/token' }));
                        return client.close();
                    }

                    // Authenticate Agent
                    const authenticated = await this.cocktailService.authenticateAgent(deviceId, token);
                    if (!authenticated) {
                        client.send(JSON.stringify({ t: 'err', code: 'AUTH_FAILED', message: 'Invalid credentials' }));
                        return client.close();
                    }

                    this.hub.registerAgent(deviceId, client);
                    client.send(JSON.stringify({ t: 'ok', for: 'hello' }));
                    return;
                }

                if (msg.t === 'metrics' || msg.t === 'net' || msg.t === 'conns' || msg.t === 'log' || msg.t === 'ui_boost_log' || msg.t === 'task_progress') {
                    if (client.deviceId) {
                        this.hub.broadcastToUi(client.deviceId, msg);
                    }
                }
            } catch (e) {
                this.logger.error('Agent message error', e);
            }
        });
    }

    handleDisconnect(client: AgentSocket) {
        this.hub.removeAgent(client);
    }
}

@WebSocketGateway({
    path: '/cockpit/cocktail/ws/ui',
    transports: ['websocket'],
})
export class CocktailUiGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(CocktailUiGateway.name);

    constructor(
        private readonly hub: CocktailWsHub,
        private readonly drizzle: DrizzleService,
    ) { }

    async handleConnection(client: UiSocket, request: IncomingMessage) {
        client.isAlive = true;
        client.on('pong', () => (client.isAlive = true));

        try {
            // 1. Authenticate UI (Session Cookie)
            const cookieHeader = request.headers.cookie || '';
            const cookies = parse(cookieHeader);
            const sessionId = cookies[COOKIE_NAMES.SESSION];

            if (!sessionId) {
                client.close(1008, 'Authentication required');
                return;
            }

            const [session] = await this.drizzle.db
                .select()
                .from(sessions)
                .where(
                    and(
                        eq(sessions.id, sessionId),
                        isNull(sessions.revokedAt),
                        gt(sessions.expiresAt, new Date())
                    )
                );

            if (!session) {
                client.close(1008, 'Invalid session');
                return;
            }

            client.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());

                    if (msg.t === 'ui_hello') {
                        // TODO: Verify user owns deviceId
                        this.hub.registerUi(msg.deviceId, client);
                        return;
                    }

                    if (msg.t === 'sub') {
                        msg.topics?.forEach((t: string) => client.topics?.add(t));
                        if (client.deviceId) {
                            this.hub.sendInitialCache(client.deviceId, client);
                        }
                        return;
                    }

                    if (msg.t === 'unsub') {
                        msg.topics?.forEach((t: string) => client.topics?.delete(t));
                        return;
                    }

                    // Forward log commands or other UI-to-Agent messages
                    if (msg.t === 'log_start' || msg.t === 'log_stop' || msg.t === 'cmd') {
                        if (client.deviceId) {
                            this.hub.sendToAgent(client.deviceId, msg);
                        }
                    }

                } catch (e) {
                    this.logger.error('UI message error', e);
                }
            });

        } catch (e) {
            this.logger.error('UI connection error', e);
            client.close(1011, 'Internal error');
        }
    }

    handleDisconnect(client: UiSocket) {
        this.hub.removeUi(client);
    }
}
