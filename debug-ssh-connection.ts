import { Client } from 'ssh2';
import * as net from 'net';

const config = {
    host: '178.156.213.99',
    port: 22,
    username: 'root',
    password: 'Ripun@781320', // We don't valid pw for handshake test
    readyTimeout: 20000,
    debug: (msg: string) => console.log(`[SSH2 DEBUG] ${msg}`),
};

async function testTcp() {
    console.log('\n--- HEADLESS TCP TEST ---');
    return new Promise<void>((resolve) => {
        const socket = new net.Socket();
        const start = Date.now();

        console.log(`[TCP] Connecting to ${config.host}:${config.port}...`);

        socket.connect(config.port, config.host, () => {
            console.log(`[TCP] ✅ Connected in ${Date.now() - start}ms!`);
            console.log('[TCP] Sending fake banner: SSH-2.0-DebugProbe_1.0\\r\\n');
            socket.write('SSH-2.0-DebugProbe_1.0\r\n');
        });

        socket.on('data', (data) => {
            console.log(`[TCP] 📩 Received data: ${JSON.stringify(data.toString())}`);
            // If we get a banner (e.g. "SSH-2.0-OpenSSH..."), the server is ALIVE and talking SSH.
            socket.end();
            resolve();
        });

        socket.on('error', (err) => {
            console.error(`[TCP] ❌ Error: ${err.message}`);
            resolve();
        });

        socket.on('close', (hadError) => {
            console.log(`[TCP] 🛑 Connection closed (Error: ${hadError})`);
            if (!hadError) resolve();
        });

        setTimeout(() => {
            console.log('[TCP] ⚠️ Timeout waiting for data (Server connected but sent nothing?)');
            socket.destroy();
            resolve();
        }, 5000);
    });
}

function testSsh2() {
    console.log('\n--- SSH2 LIBRARY HANDSHAKE TEST ---');
    const conn = new Client();

    conn.on('ready', () => {
        console.log('[SSH2] Client :: ready');
        conn.end();
    });

    conn.on('banner', (msg) => {
        console.log(`[SSH2] Banner received: ${msg}`);
    });

    conn.on('handshake', (negotiated) => {
        console.log('[SSH2] Handshake negotiated!');
        console.log(negotiated);
    });

    conn.on('error', (err: any) => {
        console.error(`[SSH2] Connection Error: ${err.message}`);
        if (err.level) console.error(`[SSH2] Level: ${err.level}`);
        console.error(err);
    });

    conn.on('close', () => {
        console.log('[SSH2] Connection :: close');
    });

    // We enable ALL algorithms to see if that helps
    const options: any = {
        host: config.host,
        port: config.port,
        username: config.username,
        // password: config.password, // Intentionally omit to fail at auth, passing handshake
        tryKeyboard: true,
        debug: (msg: string) => console.log(`[SSH2-RAW] ${msg}`),
        algorithms: {
            kex: [
                'diffie-hellman-group1-sha1',
                'diffie-hellman-group14-sha1',
                'ecdh-sha2-nistp256',
                'ecdh-sha2-nistp384',
                'ecdh-sha2-nistp521',
                'curve25519-sha256',
                'curve25519-sha256@libssh.org',
                'diffie-hellman-group-exchange-sha1',
                'diffie-hellman-group-exchange-sha256'
            ],
            cipher: [
                'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
                'aes128-gcm', 'aes128-gcm@openssh.com',
                'aes256-gcm', 'aes256-gcm@openssh.com',
                'aes128-cbc', '3des-cbc', 'blowfish-cbc', 'cast128-cbc',
                'aes192-cbc', 'aes256-cbc', 'arcfour', 'arcfour128', 'arcfour256'
            ],
            serverHostKey: [
                'ssh-dss', 'ssh-rsa', 'ecdsa-sha2-nistp256',
                'ssh-ed25519', 'rsa-sha2-512', 'rsa-sha2-256'
            ]
        }
    };

    console.log('[SSH2] Connecting with FULL algorithm support...');
    // Log options for verification
    // console.log(options);

    try {
        conn.connect(options);
    } catch (e) {
        console.error(e);
    }
}

async function run() {
    await testTcp();
    console.log('\n----------------------------------------\n');
    testSsh2();
}

run();
