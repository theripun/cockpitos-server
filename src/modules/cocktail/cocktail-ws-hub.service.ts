import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

export type AgentSocket = WebSocket & { deviceId?: string; isAlive?: boolean };
export type UiSocket = WebSocket & { deviceId?: string; isAlive?: boolean; topics?: Set<string> };

@Injectable()
export class CocktailWsHub {
    private readonly logger = new Logger(CocktailWsHub.name);

    // deviceId -> agent socket
    private agents = new Map<string, AgentSocket>();

    // deviceId -> set of ui sockets
    private uiByDevice = new Map<string, Set<UiSocket>>();

    // Cache latest data to send to new UI subscribers immediately
    private lastKnownData = new Map<string, Record<string, any>>();

    constructor() {
        // Heartbeat interval
        setInterval(() => this.heartbeat(), 15_000);
    }

    private heartbeat() {
        this.agents.forEach((ws, deviceId) => {
            if (ws.isAlive === false) {
                this.logger.log(`Agent ${deviceId} timed out, terminating.`);
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });

        this.uiByDevice.forEach((set, deviceId) => {
            set.forEach((ws) => {
                if (ws.isAlive === false) {
                    set.delete(ws);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        });
    }

    // --- Agent Management ---

    registerAgent(deviceId: string, ws: AgentSocket) {
        // Close previous if any
        const prev = this.agents.get(deviceId);
        if (prev && prev !== ws) {
            this.logger.log(`Replacing agent socket for ${deviceId}`);
            prev.terminate();
        }

        ws.deviceId = deviceId;
        this.agents.set(deviceId, ws);

        // Notify UI that agent is online
        this.broadcastToUi(deviceId, { t: 'metrics', at: new Date().toISOString(), data: { online: true } });
    }

    removeAgent(ws: AgentSocket) {
        const deviceId = ws.deviceId;
        if (deviceId && this.agents.get(deviceId) === ws) {
            this.agents.delete(deviceId);
            this.logger.log(`Agent ${deviceId} disconnected`);
            // Notify UI offline
            this.broadcastToUi(deviceId, { t: 'metrics', at: new Date().toISOString(), data: { online: false } });
        }
    }

    // --- UI Management ---

    registerUi(deviceId: string, ws: UiSocket) {
        ws.deviceId = deviceId;
        ws.topics = new Set();

        if (!this.uiByDevice.has(deviceId)) {
            this.uiByDevice.set(deviceId, new Set());
        }
        this.uiByDevice.get(deviceId)!.add(ws);
    }

    removeUi(ws: UiSocket) {
        const deviceId = ws.deviceId;
        if (deviceId && this.uiByDevice.has(deviceId)) {
            this.uiByDevice.get(deviceId)!.delete(ws);
        }
    }

    // --- Messaging ---

    broadcastToUi(deviceId: string, msg: any) {
        // Cache net and conns specifically
        if (msg.t === 'net' || msg.t === 'conns') {
            if (!this.lastKnownData.has(deviceId)) this.lastKnownData.set(deviceId, {});
            this.lastKnownData.get(deviceId)![msg.t] = msg;
        }

        const uis = this.uiByDevice.get(deviceId);
        if (!uis) return;

        const payload = JSON.stringify(msg);
        uis.forEach((ui) => {
            if (ui.readyState === WebSocket.OPEN) {
                if (ui.topics?.has(msg.t) || msg.t === 'metrics') {
                    ui.send(payload);
                }
            }
        });
    }

    sendInitialCache(deviceId: string, ws: UiSocket) {
        const cache = this.lastKnownData.get(deviceId);
        if (!cache || ws.readyState !== WebSocket.OPEN) return;

        Object.values(cache).forEach(msg => {
            if (ws.topics?.has(msg.t)) {
                ws.send(JSON.stringify(msg));
            }
        });
    }

    sendToAgent(deviceId: string, msg: any) {
        const agent = this.agents.get(deviceId);
        if (agent && agent.readyState === WebSocket.OPEN) {
            agent.send(JSON.stringify(msg));
            return true;
        }
        return false;
    }
}
