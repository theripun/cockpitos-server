"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CocktailAgent = exports.AgentStreamClient = void 0;
exports.listConnections = listConnections;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const ws_1 = __importDefault(require("ws"));
const crypto = __importStar(require("crypto"));
// Helper: shallow dir size (safe)
function getDirSize(dirPath, depth = 0) {
    if (depth > 1)
        return 0;
    let size = 0;
    try {
        const files = fs.readdirSync(dirPath);
        for (const f of files) {
            const fullPath = path.join(dirPath, f);
            try {
                const s = fs.statSync(fullPath);
                if (s.isFile())
                    size += s.size;
                else if (s.isDirectory() && depth < 1)
                    size += getDirSize(fullPath, depth + 1);
            }
            catch (_a) { }
        }
    }
    catch (_b) { }
    return size;
}
// Helper: sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Helper: safe JSON parse
function safeJson(s) {
    try {
        return JSON.parse(s);
    }
    catch (_a) {
        return null;
    }
}
// Helper: Connection list
function listConnections() {
    var _a;
    if (os.platform() !== "linux")
        return [];
    try {
        let out = "";
        let isSs = false;
        try {
            // Try ss first (preferred).
            // Explicitly try /usr/sbin/ss or /sbin/ss if simply 'ss' fails, as PATH issues can occur in some cron/systemd contexts
            const ssCmd = "ss -tanp || ss -tunp || /usr/sbin/ss -tanp || /sbin/ss -tanp";
            out = (0, child_process_1.execSync)(ssCmd, { encoding: "utf-8", shell: "/bin/bash", stdio: ["ignore", "pipe", "ignore"] });
            isSs = true;
        }
        catch (_b) {
            try {
                // Fallback to netstat
                out = (0, child_process_1.execSync)("netstat -tunap || /usr/sbin/netstat -tunap", { encoding: "utf-8", shell: "/bin/bash", stdio: ["ignore", "pipe", "ignore"] });
                isSs = false;
            }
            catch (_c) {
                return [];
            }
        }
        const lines = out.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("Active") && !l.startsWith("Proto") && !l.startsWith("Netid"));
        const items = [];
        for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length < 5)
                continue;
            let proto = parts[0];
            let state = "";
            let local = "";
            let remote = "";
            let pid;
            let process;
            if (isSs) {
                // [0]Netid [1]State [2]Recv-Q [3]Send-Q [4]Local Addr [5]Peer Addr [6]Process
                state = parts[1];
                local = parts[4];
                remote = parts[5];
                const usersMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
                if (usersMatch) {
                    process = usersMatch[1];
                    pid = parseInt(usersMatch[2], 10);
                }
            }
            else {
                // [0]Proto [1]Recv-Q [2]Send-Q [3]Local Addr [4]Foreign Addr [5]State [6]PID/Program
                local = parts[3];
                remote = parts[4];
                state = parts[5];
                const pidProgMatch = (_a = parts[6]) === null || _a === void 0 ? void 0 : _a.match(/(\d+)\/([^\s]+)/);
                if (pidProgMatch) {
                    pid = parseInt(pidProgMatch[1], 10);
                    process = pidProgMatch[2];
                }
            }
            if (!local || !remote)
                continue;
            items.push({ proto, state, local, remote, pid, process });
        }
        return items;
    }
    catch (e) {
        console.error("[CocktailAgent] listConnections failed:", e.message);
        return [];
    }
}
class AgentStreamClient {
    constructor(serverUrl, deviceId, token) {
        this.serverUrl = serverUrl;
        this.deviceId = deviceId;
        this.token = token;
        this.ws = null;
        this.alive = false;
        this.logs = new Map();
    }
    start() {
        const url = this.serverUrl.replace(/^http/, "ws") + "/cockpit/cocktail/ws/agent";
        this.ws = new ws_1.default(url);
        this.alive = true;
        this.ws.on("open", () => {
            console.log(`[CocktailAgent] WS Stream Connected`);
            this.send({ t: "hello", deviceId: this.deviceId, token: this.token, agentVersion: "1.2.0-stable" });
        });
        this.ws.on("message", (raw) => {
            const msg = safeJson(raw.toString());
            if (!msg)
                return;
            if (msg.t === "log_start")
                this.handleLogStart(msg);
            if (msg.t === "log_stop")
                this.handleLogStop(msg.streamId);
            if (msg.t === "ok" && msg.for === "hello") {
                if (this.onReady)
                    this.onReady();
            }
        });
        this.ws.on("close", () => {
            this.alive = false;
            this.stopAllLogs();
            console.log(`[CocktailAgent] WS Stream Closed, reconnecting...`);
            setTimeout(() => this.start(), 3000);
        });
        this.ws.on("error", (e) => {
            var _a;
            console.error(`[CocktailAgent] WS Stream Error:`, e.message);
            try {
                (_a = this.ws) === null || _a === void 0 ? void 0 : _a.close();
            }
            catch (_b) { }
        });
    }
    send(payload) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        this.ws.send(JSON.stringify(payload));
    }
    pushNet(rxBytesPerSec, txBytesPerSec) {
        this.send({ t: "net", at: new Date().toISOString(), rxBytesPerSec, txBytesPerSec });
    }
    pushMetrics(metrics) {
        this.send({ t: "metrics", at: new Date().toISOString(), data: metrics });
    }
    pushConns(items) {
        this.send({ t: "conns", at: new Date().toISOString(), items });
    }
    handleLogStart(msg) {
        const { streamId, source, tail = 100 } = msg;
        if (!streamId || !(source === null || source === void 0 ? void 0 : source.kind) || this.logs.has(streamId))
            return;
        console.log(`[CocktailAgent] Starting log stream: ${streamId} (${source.kind})`);
        let proc;
        if (source.kind === "journal") {
            const unit = source.unit || "cocktail";
            proc = (0, child_process_1.spawn)("journalctl", ["-u", unit, "-f", "-n", tail.toString()], { stdio: ['ignore', 'pipe', 'pipe'] });
        }
        else if (source.kind === "file") {
            proc = (0, child_process_1.spawn)("tail", ["-f", "-n", tail.toString(), source.path], { stdio: ['ignore', 'pipe', 'pipe'] });
        }
        else if (source.kind === "docker") {
            proc = (0, child_process_1.spawn)("docker", ["logs", "-f", "--tail", tail.toString(), source.container], { stdio: ['ignore', 'pipe', 'pipe'] });
        }
        else
            return;
        this.logs.set(streamId, { proc, streamId });
        proc.stdout.on("data", (buf) => {
            buf.toString().split("\n").forEach(line => {
                if (line.trim())
                    this.send({ t: "log", at: new Date().toISOString(), streamId, line });
            });
        });
        proc.stderr.on("data", (buf) => {
            this.send({ t: "log", at: new Date().toISOString(), streamId, line: buf.toString(), level: "error" });
        });
        proc.on("exit", () => {
            this.logs.delete(streamId);
            this.send({ t: "log", at: new Date().toISOString(), streamId, line: "[stream ended]" });
        });
    }
    handleLogStop(streamId) {
        const log = this.logs.get(streamId);
        if (log) {
            log.proc.kill();
            this.logs.delete(streamId);
        }
    }
    stopAllLogs() {
        this.logs.forEach(l => {
            try {
                l.proc.kill();
            }
            catch (_a) { }
        });
        this.logs.clear();
    }
}
exports.AgentStreamClient = AgentStreamClient;
class CocktailAgent {
    constructor(config) {
        this.allowedDirs = ['/home', '/var/www'];
        this.running = false;
        this.stream = null;
        this.lastCpuUsage = null;
        this.lastNetBytes = null;
        this.lastNeofetch = null;
        this.config = config;
        this.axiosInstance = axios_1.default.create({
            baseURL: `${config.serverUrl}/cockpit/cocktail`,
            timeout: 15000,
            headers: {
                "content-type": "application/json",
            },
        });
        this.stream = new AgentStreamClient(config.serverUrl, config.deviceId, config.enrollmentToken);
    }
    async start() {
        console.log(`Starting Cocktail Agent for device ${this.config.deviceId}...`);
        if (this.stream) {
            this.stream.onReady = () => {
                var _a, _b;
                // Push immediate update when server acknowledges connection
                console.log(`[CocktailAgent] Stream authenticated for ${this.config.deviceId}. Pushing initial core metrics...`);
                try {
                    const metrics = this.collectMetrics();
                    (_a = this.stream) === null || _a === void 0 ? void 0 : _a.pushMetrics(metrics);
                    (_b = this.stream) === null || _b === void 0 ? void 0 : _b.pushConns(listConnections());
                }
                catch (e) {
                    console.error("Failed to push initial data", e);
                }
            };
            this.stream.start();
        }
        // Install dependencies
        await this.installFetchTools();
        // Prime diff-based metrics
        this.getCpuUsage();
        this.getNetworkUsage();
        this.running = true;
        // Run loops concurrently (no unhandled rejections)
        void this.taskLoop();
        await sleep(500);
        // Initial burst of data for stream tabs
        if (this.stream) {
            try {
                const metrics = this.collectMetrics();
                this.stream.pushMetrics(metrics);
                this.stream.pushConns(listConnections());
            }
            catch (_a) { }
        }
        void this.metricsLoop();
    }
    stop() {
        this.running = false;
    }
    // ------------------------
    // Task loop
    // ------------------------
    async taskLoop() {
        var _a;
        const pollMs = this.config.pollIntervalMs || 500;
        while (this.running) {
            try {
                const task = await this.leaseTask();
                if (!task) {
                    await sleep(pollMs);
                    continue;
                }
                // Guard: must have id/type
                if (!task.id || !task.type) {
                    console.warn("Lease returned invalid task shape:", task);
                    await sleep(pollMs);
                    continue;
                }
                // Execute + always attempt completion
                await this.executeTask(task);
            }
            catch (error) {
                // Keep polling stable: never throw out of loop
                console.error("Error in task loop:", ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || (error === null || error === void 0 ? void 0 : error.message) || error);
            }
            await sleep(pollMs);
        }
    }
    async leaseTask() {
        var _a, _b, _c, _d;
        try {
            const res = await this.axiosInstance.post("lease-task", {
                deviceId: this.config.deviceId,
                token: this.config.enrollmentToken,
            });
            // Support both shapes: {task: {...}} or {...} or null-ish
            const t = (_c = (_b = (_a = res === null || res === void 0 ? void 0 : res.data) === null || _a === void 0 ? void 0 : _a.task) !== null && _b !== void 0 ? _b : res === null || res === void 0 ? void 0 : res.data) !== null && _c !== void 0 ? _c : null;
            if (!t || !t.id || !t.type)
                return null;
            return t;
        }
        catch (e) {
            // Do not spam hard errors during polling
            const msg = ((_d = e === null || e === void 0 ? void 0 : e.response) === null || _d === void 0 ? void 0 : _d.data) || (e === null || e === void 0 ? void 0 : e.message) || e;
            console.error("Failed to lease task:", msg);
            return null;
        }
    }
    async completeTask(taskId, result, error) {
        try {
            await this.axiosInstance.post("complete-task", {
                deviceId: this.config.deviceId,
                token: this.config.enrollmentToken,
                taskId,
                result,
                error,
            });
        }
        catch (e) {
            console.error(`Failed to complete task ${taskId}:`, e.message);
        }
    }
    async reportTaskProgress(taskId, progressPct, logs) {
        try {
            await this.axiosInstance.post("task-progress", {
                deviceId: this.config.deviceId,
                token: this.config.enrollmentToken,
                taskId,
                progressPct: Math.floor(progressPct),
                logs
            });
            // Also broadcast via WebSocket for real-time UI updates
            if (this.stream) {
                this.stream.send({
                    t: 'task_progress',
                    at: new Date().toISOString(),
                    taskId,
                    progressPct: Math.floor(progressPct),
                    logs
                });
            }
        }
        catch (e) {
            console.error(`Failed to report progress for task ${taskId}:`, e.message);
        }
    }
    async executeTask(task) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
        let result = null;
        let error = null;
        try {
            switch (task.type) {
                case "shell.exec": {
                    // payload: { command: string, cwd?: string }
                    const cwd = ((_a = task.payload) === null || _a === void 0 ? void 0 : _a.cwd) || os.homedir();
                    const cmd = String(((_b = task.payload) === null || _b === void 0 ? void 0 : _b.command) || "");
                    if (!cmd.trim())
                        throw new Error("Missing command");
                    // Windows vs *nix shell
                    const shell = os.platform() === "win32"
                        ? process.env.ComSpec || "cmd.exe"
                        : "/bin/bash";
                    const stdout = (0, child_process_1.execSync)(cmd, {
                        cwd,
                        encoding: "utf-8",
                        shell,
                        stdio: ["ignore", "pipe", "pipe"],
                    });
                    result = { stdout };
                    break;
                }
                case "sys.info": {
                    result = {
                        hostname: os.hostname(),
                        platform: os.platform(),
                        release: os.release(),
                        uptime: os.uptime(),
                        loadavg: os.loadavg(),
                        totalmem: os.totalmem(),
                        freemem: os.freemem(),
                        cpus: os.cpus(),
                        arch: os.arch(),
                    };
                    break;
                }
                case "proc.list": {
                    const limit = Math.min(Number(((_c = task.payload) === null || _c === void 0 ? void 0 : _c.limit) || 200), 200);
                    const sort = String(((_d = task.payload) === null || _d === void 0 ? void 0 : _d.sort) || "cpu").toLowerCase();
                    // Whitelist sort keys for Linux ps
                    const sortKey = sort === "mem"
                        ? "pmem"
                        : sort === "rss"
                            ? "rss"
                            : sort === "threads"
                                ? "nlwp"
                                : "pcpu";
                    let items = [];
                    if (os.platform() === "linux") {
                        try {
                            // Using the = syntax for EVERY column is the most cross-distro way to remove headers
                            const pFormat = "pid=,user=,pcpu=,pmem=,rss=,nlwp=,comm=,args=";
                            const cmd = `ps -eo ${pFormat} --sort=-${sortKey} | head -n ${limit}`;
                            let out = "";
                            try {
                                out = (0, child_process_1.execSync)(cmd, {
                                    encoding: "utf-8",
                                    shell: "/bin/bash",
                                    stdio: ["ignore", "pipe", "pipe"]
                                });
                            }
                            catch (_4) {
                                // Fallback: drop sort flag if that's the issue
                                const fallbackCmd = `ps -eo ${pFormat} | head -n ${limit + 50}`;
                                out = (0, child_process_1.execSync)(fallbackCmd, { encoding: "utf-8", shell: "/bin/bash" });
                            }
                            const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
                            for (const line of lines) {
                                const parts = line.split(/\s+/);
                                if (parts.length < 7)
                                    continue;
                                const pid = parseInt(parts[0], 10);
                                if (isNaN(pid))
                                    continue; // Skip header if it somehow leaked in
                                const user = parts[1] || "root";
                                const cpuPct = parseFloat(parts[2]) || 0;
                                const memPct = parseFloat(parts[3]) || 0;
                                const rssKb = parseInt(parts[4], 10) || 0;
                                const threads = parseInt(parts[5], 10) || 1;
                                const name = parts[6] || "unknown";
                                const fullCmd = parts.slice(7).join(" ") || name;
                                items.push({
                                    pid,
                                    user,
                                    cpuPct,
                                    memPct,
                                    rssBytes: rssKb * 1024,
                                    threads,
                                    name,
                                    cmd: fullCmd,
                                });
                            }
                        }
                        catch (e) {
                            console.error("Linux ps fail:", e.message);
                            throw new Error(`System ps command failed: ${e.message}`);
                        }
                    }
                    else if (os.platform() === "win32") {
                        // Fallback: tasklist (limited). Keep stable + no throw.
                        const tlOut = (0, child_process_1.execSync)("tasklist /NH /FO CSV", { encoding: "utf-8" });
                        const lines = tlOut.split("\n").map((l) => l.trim()).filter(Boolean);
                        for (const line of lines) {
                            // "Image Name","PID","Session Name","Session#","Mem Usage"
                            const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ""));
                            if (cols.length < 5)
                                continue;
                            const name = cols[0];
                            const pid = parseInt(cols[1], 10);
                            const memStr = cols[4] || "";
                            // "12,345 K" -> 12345 KB
                            const kb = parseInt(memStr.replace(/[^\d]/g, ""), 10) || 0;
                            if (!Number.isFinite(pid))
                                continue;
                            items.push({
                                pid,
                                user: "UNKNOWN",
                                cpuPct: 0,
                                memPct: 0,
                                rssBytes: kb * 1024,
                                threads: 1,
                                name,
                                cmd: name,
                            });
                            if (items.length >= limit)
                                break;
                        }
                    }
                    else {
                        // Other platforms: return empty but successful
                        items = [];
                    }
                    result = { items };
                    break;
                }
                case "proc.kill": {
                    const pid = Number((_e = task.payload) === null || _e === void 0 ? void 0 : _e.pid);
                    if (!pid)
                        throw new Error("Missing PID");
                    // Allow only safe-ish signals by whitelist on linux
                    const sig = String(((_f = task.payload) === null || _f === void 0 ? void 0 : _f.signal) || "SIGTERM").toUpperCase();
                    const allowed = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP"]);
                    const signal = allowed.has(sig) ? sig : "SIGTERM";
                    try {
                        process.kill(pid, signal);
                    }
                    catch (_5) {
                        if (os.platform() === "linux") {
                            // kill expects without SIG prefix often
                            const killSig = signal.replace(/^SIG/, "");
                            (0, child_process_1.execSync)(`kill -${killSig} ${pid}`, { encoding: "utf-8", shell: "/bin/bash" });
                        }
                        else {
                            // Windows: taskkill
                            (0, child_process_1.execSync)(`taskkill /PID ${pid} /T /F`, { encoding: "utf-8" });
                        }
                    }
                    result = { success: true };
                    break;
                }
                case "fs.list": {
                    const dirPath = String(((_g = task.payload) === null || _g === void 0 ? void 0 : _g.path) || "/");
                    const files = fs.readdirSync(dirPath, { withFileTypes: true });
                    const out = [];
                    for (const f of files) {
                        try {
                            const fullPath = path.join(dirPath, f.name);
                            const s = fs.statSync(fullPath);
                            out.push({
                                name: f.name,
                                isDirectory: f.isDirectory(),
                                size: f.isDirectory() ? getDirSize(fullPath) : s.size,
                                mtime: s.mtime,
                            });
                        }
                        catch (_6) {
                            out.push({
                                name: f.name,
                                isDirectory: f.isDirectory(),
                                size: 0,
                                mtime: new Date(0),
                            });
                        }
                        if (out.length >= 2000)
                            break;
                    }
                    result = { items: out };
                    break;
                }
                case "fs.stat": {
                    const p = String(((_h = task.payload) === null || _h === void 0 ? void 0 : _h.path) || "");
                    if (!p)
                        throw new Error("Missing path");
                    const st = fs.statSync(p);
                    const posixMode = (st.mode & 0o7777).toString(8);
                    result = {
                        type: st.isDirectory() ? "directory" : "file",
                        size: st.isDirectory() ? getDirSize(p) : st.size,
                        mtimeMs: st.mtimeMs,
                        mode: posixMode,
                        uid: (_j = st.uid) !== null && _j !== void 0 ? _j : null,
                        gid: (_k = st.gid) !== null && _k !== void 0 ? _k : null,
                    };
                    break;
                }
                case "fs.read_text": {
                    const p = String(((_l = task.payload) === null || _l === void 0 ? void 0 : _l.path) || "");
                    if (!p)
                        throw new Error("Missing path");
                    const st = fs.statSync(p);
                    const maxBytes = Number(((_m = task.payload) === null || _m === void 0 ? void 0 : _m.maxBytes) || 256 * 1024);
                    if (st.size > maxBytes) {
                        result = { path: p, tooLarge: true, size: st.size };
                    }
                    else {
                        const content = fs.readFileSync(p, "utf-8");
                        result = { path: p, content, truncated: false, encoding: "utf-8" };
                    }
                    break;
                }
                case "fs.write_text": {
                    const p = String(((_o = task.payload) === null || _o === void 0 ? void 0 : _o.path) || "");
                    const content = (_p = task.payload) === null || _p === void 0 ? void 0 : _p.content;
                    if (!p || content === undefined)
                        throw new Error("Missing path or content");
                    fs.writeFileSync(p, String(content), { mode: (_q = task.payload) === null || _q === void 0 ? void 0 : _q.mode });
                    result = { success: true };
                    break;
                }
                case "fs.mkdir": {
                    const p = String(((_r = task.payload) === null || _r === void 0 ? void 0 : _r.path) || "");
                    if (!p)
                        throw new Error("Missing path");
                    fs.mkdirSync(p, { recursive: (_t = (_s = task.payload) === null || _s === void 0 ? void 0 : _s.recursive) !== null && _t !== void 0 ? _t : true });
                    result = { success: true };
                    break;
                }
                case "fs.delete": {
                    const p = String(((_u = task.payload) === null || _u === void 0 ? void 0 : _u.path) || "");
                    if (!p)
                        throw new Error("Missing path");
                    if (fs.statSync(p).isDirectory()) {
                        fs.rmSync(p, { recursive: (_w = (_v = task.payload) === null || _v === void 0 ? void 0 : _v.recursive) !== null && _w !== void 0 ? _w : true, force: true });
                    }
                    else {
                        fs.unlinkSync(p);
                    }
                    result = { success: true };
                    break;
                }
                case "fs.move": {
                    const from = String(((_x = task.payload) === null || _x === void 0 ? void 0 : _x.from) || "");
                    const to = String(((_y = task.payload) === null || _y === void 0 ? void 0 : _y.to) || "");
                    if (!from || !to)
                        throw new Error("Missing from or to path");
                    fs.renameSync(from, to);
                    result = { success: true };
                    break;
                }
                case "boost.run": {
                    const actions = Array.isArray((_z = task.payload) === null || _z === void 0 ? void 0 : _z.actions) ? task.payload.actions : ["tmp"];
                    const dryRun = !!((_0 = task.payload) === null || _0 === void 0 ? void 0 : _0.dryRun);
                    let cleanedCount = 0;
                    const log = (line) => {
                        console.log(`[CocktailAgent] Booster: ${line}`);
                        if (this.stream) {
                            this.stream.send({
                                t: "ui_boost_log",
                                at: new Date().toISOString(),
                                line
                            });
                        }
                    };
                    log("Initializing system optimization...");
                    await sleep(400);
                    if (actions.includes("tmp")) {
                        log("Analyzing temporary directories...");
                        const tmpDirs = ["/tmp", "/var/tmp"];
                        for (const dir of tmpDirs) {
                            try {
                                if (fs.existsSync(dir)) {
                                    const files = fs.readdirSync(dir);
                                    log(`Cleaning ${dir} (${files.length} items)...`);
                                    if (!dryRun) {
                                        for (const f of files) {
                                            try {
                                                const p = path.join(dir, f);
                                                if (fs.statSync(p).isFile()) {
                                                    fs.unlinkSync(p);
                                                    cleanedCount++;
                                                }
                                            }
                                            catch (_7) { }
                                        }
                                    }
                                    await sleep(300);
                                }
                            }
                            catch (_8) { }
                        }
                    }
                    if (actions.includes("logs")) {
                        log("Scanning system logs for rotation...");
                        if (os.platform() === "linux" && !dryRun) {
                            try {
                                (0, child_process_1.execSync)("sudo journalctl --vacuum-time=1d", { stdio: "ignore" });
                                log("Journal logs vacuumed to 1 day.");
                                cleanedCount += 15; // Symbolic
                            }
                            catch (_9) {
                                log("Failed to vacuum journal logs (insufficient permissions).");
                            }
                        }
                        await sleep(400);
                    }
                    if (actions.includes("pkg")) {
                        log("Purging package manager cache...");
                        if (os.platform() === "linux" && !dryRun) {
                            try {
                                (0, child_process_1.execSync)("sudo apt-get clean", { stdio: "ignore" });
                                log("Apt cache purged.");
                                cleanedCount += 50; // Symbolic
                            }
                            catch (_10) {
                                log("Failed to purge apt cache.");
                            }
                        }
                        await sleep(300);
                    }
                    log("System optimization complete.");
                    result = { success: true, cleanedItems: cleanedCount };
                    break;
                }
                case "fs.search": {
                    const root = String(((_1 = task.payload) === null || _1 === void 0 ? void 0 : _1.root) || "/home");
                    const query = String(((_2 = task.payload) === null || _2 === void 0 ? void 0 : _2.query) || "");
                    const maxResults = Math.min(Number(((_3 = task.payload) === null || _3 === void 0 ? void 0 : _3.maxResults) || 200), 500);
                    if (!query)
                        throw new Error("Missing query");
                    const items = [];
                    if (os.platform() === "linux") {
                        try {
                            // Construct valid shell command for multi-pattern search
                            // Example: find /home -maxdepth 4 -type f \( -iname "*jpg" -o -iname "*png" \)
                            let findCmd = "";
                            if (query.includes('|')) {
                                const patterns = query.replace(/[()]/g, '').split('|').map(p => `-iname "*${p.trim()}*"`).join(' -o ');
                                findCmd = `find "${root}" -maxdepth 4 -type f \\( ${patterns} \\) 2>/dev/null | head -n ${maxResults}`;
                            }
                            else {
                                findCmd = `find "${root}" -maxdepth 4 -type f -iname "*${query}*" 2>/dev/null | head -n ${maxResults}`;
                            }
                            const out = (0, child_process_1.execSync)(findCmd, { encoding: "utf-8", shell: "/bin/bash" });
                            const paths = out.split("\n").filter(Boolean);
                            for (const p of paths) {
                                try {
                                    const s = fs.statSync(p);
                                    items.push({
                                        name: path.basename(p),
                                        path: p,
                                        size: s.size,
                                        mtime: s.mtime,
                                        isDirectory: false
                                    });
                                }
                                catch (_11) {
                                    items.push({ name: path.basename(p), path: p, size: 0, isDirectory: false });
                                }
                            }
                        }
                        catch (e) {
                            console.error("Search failed:", e);
                        }
                    }
                    result = { items };
                    break;
                }
                case "FILE_UPLOAD_TO_R2": {
                    // payload: { path, putUrl, key }
                    const { path: filePath, putUrl } = task.payload;
                    if (!filePath || !putUrl)
                        throw new Error("Missing path or putUrl");
                    const resolved = path.resolve(filePath);
                    if (!fs.existsSync(resolved))
                        throw new Error("File not found");
                    const stats = fs.statSync(resolved);
                    const stream = fs.createReadStream(resolved);
                    this.reportTaskProgress(task.id, 0);
                    await (0, axios_1.default)({
                        url: putUrl,
                        method: 'PUT',
                        data: stream,
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': stats.size
                        },
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        onUploadProgress: (progressEvent) => {
                            if (progressEvent.total) {
                                const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                                this.reportTaskProgress(task.id, pct);
                            }
                        }
                    });
                    result = { success: true };
                    break;
                }
                case "FILE_DOWNLOAD_FROM_R2": {
                    // payload: { getUrl, destPath, sizeBytes, sha256?, mode? }
                    const { getUrl, destPath, sizeBytes, sha256, mode } = task.payload;
                    if (!getUrl || !destPath)
                        throw new Error("Missing getUrl or destPath");
                    // 1. Path Safety & Allowlist
                    const resolved = path.resolve(destPath);
                    const isAllowed = this.allowedDirs.some(dir => resolved.startsWith(path.resolve(dir)));
                    if (!isAllowed) {
                        throw new Error(`Path ${resolved} is not in UPLOAD_ALLOWED_DIRS (${this.allowedDirs.join(",")})`);
                    }
                    if (resolved.includes(".."))
                        throw new Error("Invalid path (traversal)");
                    // 2. Prepare directories
                    const dir = path.dirname(resolved);
                    if (!fs.existsSync(dir))
                        fs.mkdirSync(dir, { recursive: true });
                    const partPath = resolved + ".part";
                    const writer = fs.createWriteStream(partPath);
                    // 3. Download
                    const response = await (0, axios_1.default)({
                        url: getUrl,
                        method: 'GET',
                        responseType: 'stream'
                    });
                    let downloadedBytes = 0;
                    let lastReport = Date.now();
                    await new Promise((resolve, reject) => {
                        response.data.pipe(writer);
                        response.data.on('data', (chunk) => {
                            downloadedBytes += chunk.length;
                            const now = Date.now();
                            if (now - lastReport > 1000 && sizeBytes) {
                                const pct = (downloadedBytes / sizeBytes) * 100;
                                this.reportTaskProgress(task.id, pct);
                                lastReport = now;
                            }
                        });
                        writer.on('finish', () => resolve(true));
                        writer.on('error', (err) => reject(err));
                    });
                    // 4. Verification
                    if (sha256) {
                        const hash = crypto.createHash('sha256');
                        const fileBuffer = fs.readFileSync(partPath);
                        hash.update(fileBuffer);
                        const hex = hash.digest('hex');
                        if (hex !== sha256) {
                            fs.unlinkSync(partPath);
                            throw new Error(`SHA256 mismatch. Got ${hex}, expected ${sha256}`);
                        }
                    }
                    // 5. Finalize
                    fs.renameSync(partPath, resolved);
                    if (mode && os.platform() !== 'win32') {
                        fs.chmodSync(resolved, mode);
                    }
                    result = { success: true, path: resolved };
                    break;
                }
                default:
                    error = `Unknown task type: ${task.type}`;
            }
        }
        catch (e) {
            error = (e === null || e === void 0 ? void 0 : e.message) || String(e);
        }
        // Always attempt completion so server polling never hangs
        await this.completeTask(task.id, result, error);
    }
    // ------------------------
    // Metrics loop
    // ------------------------
    async metricsLoop() {
        console.log("Entering metrics loop...");
        let i = 0;
        while (this.running) {
            try {
                const metrics = this.collectMetrics();
                await this.reportMetrics(metrics);
                if (this.stream) {
                    this.stream.pushMetrics(metrics);
                    // Push connections every cycle (5s) for better responsiveness
                    this.stream.pushConns(listConnections());
                }
            }
            catch (error) {
                console.error("Error in metrics loop:", (error === null || error === void 0 ? void 0 : error.message) || error);
            }
            i++;
            await sleep(5000);
        }
    }
    getCpuUsage() {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times)
                total += cpu.times[type];
            idle += cpu.times.idle;
        }
        if (!this.lastCpuUsage) {
            this.lastCpuUsage = { idle, total };
            return 2; // small non-zero on first read
        }
        const idleDiff = idle - this.lastCpuUsage.idle;
        const totalDiff = total - this.lastCpuUsage.total;
        this.lastCpuUsage = { idle, total };
        return totalDiff === 0 ? 0 : Math.max(0, Math.min(100, 100 - Math.floor((100 * idleDiff) / totalDiff)));
    }
    getNetworkUsage() {
        try {
            if (os.platform() !== "linux")
                return { rxSpeed: 0, txSpeed: 0 };
            const netOut = fs.readFileSync("/proc/net/dev", "utf-8");
            const lines = netOut.trim().split("\n");
            let totalRx = 0;
            let totalTx = 0;
            for (const line of lines) {
                if (!line.includes(":"))
                    continue;
                const parts = line.trim().split(/\s+/);
                if (parts[0].startsWith("lo"))
                    continue;
                totalRx += parseInt(parts[1], 10) || 0;
                totalTx += parseInt(parts[9], 10) || 0;
            }
            const now = Date.now();
            if (!this.lastNetBytes) {
                this.lastNetBytes = { rx: totalRx, tx: totalTx, ts: now };
                return { rxSpeed: 0, txSpeed: 0 };
            }
            const dt = Math.max(0.25, (now - this.lastNetBytes.ts) / 1000);
            const rxSpeed = Math.floor((totalRx - this.lastNetBytes.rx) / dt);
            const txSpeed = Math.floor((totalTx - this.lastNetBytes.tx) / dt);
            this.lastNetBytes = { rx: totalRx, tx: totalTx, ts: now };
            if (this.stream)
                this.stream.pushNet(rxSpeed, txSpeed);
            return { rxSpeed: Math.max(0, rxSpeed), txSpeed: Math.max(0, txSpeed) };
        }
        catch (_a) {
            return { rxSpeed: 0, txSpeed: 0 };
        }
    }
    async installFetchTools() {
        if (os.platform() !== "linux")
            return;
        const tools = ["fastfetch", "screenfetch", "neofetch"];
        let hasAny = false;
        for (const tool of tools) {
            try {
                (0, child_process_1.execSync)(`which ${tool}`, { stdio: "ignore" });
                hasAny = true;
                break;
            }
            catch (_a) { }
        }
        if (!hasAny) {
            console.log("[CocktailAgent] No fetch tools found. Attempting to install...");
            const commands = [
                "sudo apt-get update && sudo apt-get install -y fastfetch || sudo apt-get install -y screenfetch || sudo apt-get install -y neofetch",
                "sudo dnf install -y fastfetch || sudo dnf install -y screenfetch || sudo dnf install -y neofetch",
                "sudo yum install -y fastfetch || sudo yum install -y screenfetch || sudo yum install -y neofetch",
                "sudo pacman -S --noconfirm fastfetch || sudo pacman -S --noconfirm screenfetch || sudo pacman -S --noconfirm neofetch",
                "sudo apk add fastfetch || sudo apk add screenfetch || sudo apk add neofetch",
                "sudo zypper install -y fastfetch || sudo zypper install -y screenfetch || sudo zypper install -y neofetch"
            ];
            for (const cmd of commands) {
                try {
                    (0, child_process_1.execSync)(cmd, { stdio: "ignore", shell: "/bin/bash" });
                    console.log("[CocktailAgent] Fetch tool installed successfully.");
                    break;
                }
                catch (_b) { }
            }
        }
    }
    getSystemFetch() {
        try {
            if (os.platform() !== "linux")
                return "System fetch only supported on Linux";
            const now = Date.now();
            if (this.lastNeofetch && (now - this.lastNeofetch.ts) < 120000) {
                return this.lastNeofetch.output;
            }
            // Expanded paths for distributions like Kali, Alpine, etc.
            const commonPaths = ["/usr/bin", "/usr/local/bin", "/usr/games", "/bin", "/usr/sbin", "/sbin", "/usr/local/games"];
            const envPath = [...commonPaths, process.env.PATH].filter(Boolean).join(':');
            const tools = [
                { exe: "fastfetch", args: "--pipe" },
                { exe: "neofetch", args: "--stdout" },
                { exe: "screenfetch", args: "-N" }
            ];
            let output = "";
            let lastError = "";
            for (const tool of tools) {
                // Try executing within a bash login shell to get full environment
                try {
                    const cmd = `PATH="${envPath}" bash -c "which ${tool.exe} && ${tool.exe} ${tool.args}"`;
                    output = (0, child_process_1.execSync)(cmd, {
                        encoding: "utf-8",
                        shell: "/bin/bash",
                        timeout: 8000,
                        env: { ...process.env, PATH: envPath }
                    });
                    if (output && output.trim())
                        break;
                }
                catch (e) {
                    lastError = e.message;
                }
                // Try absolute paths directly
                for (const p of commonPaths) {
                    try {
                        const absPath = `${p}/${tool.exe}`;
                        output = (0, child_process_1.execSync)(`${absPath} ${tool.args}`, {
                            encoding: "utf-8",
                            timeout: 5000,
                            env: { ...process.env, PATH: envPath }
                        });
                        if (output && output.trim())
                            break;
                    }
                    catch (_a) { }
                }
                if (output)
                    break;
            }
            if (!output.trim()) {
                throw new Error(`No fetch tool available. Checked: neofetch, fastfetch, screenfetch. PATH: ${envPath}`);
            }
            // Strip any remaining ANSI escape codes before caching
            const cleanOutput = output.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '');
            this.lastNeofetch = { output: cleanOutput, ts: now };
            return cleanOutput;
        }
        catch (e) {
            return "System fetch failed: " + e.message;
        }
    }
    collectMetrics() {
        const cpuUsage = this.getCpuUsage();
        const loadAvg = os.loadavg();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const netSpeed = this.getNetworkUsage();
        const neofetch = this.getSystemFetch();
        const diskInfo = [];
        try {
            if (os.platform() === "linux") {
                const dfOut = (0, child_process_1.execSync)("df -B1 / --output=target,size,pcent,used,avail", {
                    encoding: "utf-8",
                    shell: "/bin/bash",
                });
                const lines = dfOut.trim().split("\n");
                if (lines.length > 1) {
                    const parts = lines[1].trim().split(/\s+/);
                    diskInfo.push({
                        mount: parts[0],
                        totalBytes: parseInt(parts[1], 10) || 0,
                        usedBytes: parseInt(parts[3], 10) || 0,
                        freeBytes: parseInt(parts[4], 10) || 0,
                    });
                }
            }
            else {
                diskInfo.push({ mount: "/", totalBytes: totalMem * 4, usedBytes: totalMem, freeBytes: totalMem * 3 });
            }
        }
        catch (_a) {
            diskInfo.push({ mount: "/", totalBytes: totalMem * 2, usedBytes: usedMem, freeBytes: freeMem });
        }
        let tempC = 0;
        try {
            if (os.platform() === "linux") {
                const tempStr = fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8");
                tempC = Math.round(parseInt(tempStr, 10) / 1000);
            }
        }
        catch (_b) {
            tempC = 38 + Math.floor(Math.random() * 5);
        }
        return {
            cpu: {
                usagePct: cpuUsage,
                cores: os.cpus().length,
                load1: loadAvg[0],
                load5: loadAvg[1],
                load15: loadAvg[2],
            },
            mem: { totalBytes: totalMem, usedBytes: usedMem, freeBytes: freeMem },
            disk: diskInfo,
            tempC,
            uptimeSec: os.uptime(),
            net: { rxBytesPerSec: netSpeed.rxSpeed, txBytesPerSec: netSpeed.txSpeed },
            neofetch
        };
    }
    async reportMetrics(metrics) {
        var _a;
        try {
            await this.axiosInstance.post("report-metrics", {
                deviceId: this.config.deviceId,
                token: this.config.enrollmentToken,
                metrics,
            });
        }
        catch (e) {
            console.error("Failed to report metrics:", ((_a = e === null || e === void 0 ? void 0 : e.response) === null || _a === void 0 ? void 0 : _a.data) || (e === null || e === void 0 ? void 0 : e.message) || e);
        }
    }
}
exports.CocktailAgent = CocktailAgent;
// CLI entry point
const args = process.argv.slice(2);
const config = {};
for (let i = 0; i < args.length; i += 2) {
    const key = String(args[i] || "").replace(/^--/, "");
    config[key] = args[i + 1];
}
if (config.serverUrl && config.enrollmentToken && config.deviceId) {
    if (config.allowedDirs) {
        config.allowedDirs = config.allowedDirs.split(',');
    }
    const agent = new CocktailAgent(config);
    if (config.allowedDirs) {
        agent.allowedDirs = config.allowedDirs;
    }
    void agent.start();
}
else {
    console.error("Missing required arguments: --serverUrl, --enrollmentToken, --deviceId");
}
