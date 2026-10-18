// Usage:
//   node cast-debug.js <tv-ip>              -> status + app availability probe
//   node cast-debug.js <tv-ip> <appId>      -> same, then tries to LAUNCH that app ID

const http = require('http');
const { Client } = require('castv2');

const ip = process.argv[2];
const launchId = process.argv[3];

if (!ip) {
    console.error('Usage: node cast-debug.js <tv-ip> [appIdToLaunch]');
    process.exit(1);
}

const log = (...args) => console.log(new Date().toISOString().slice(11, 23), ...args);

function fetchEurekaInfo() {
    return new Promise((resolve) => {
        const req = http.get(
            { host: ip, port: 8008, path: '/setup/eureka_info?options=detail', timeout: 3000 },
            (res) => {
                let body = '';
                res.on('data', (d) => body += d);
                res.on('end', () => {
                    try {
                        log('eureka_info:', JSON.stringify(JSON.parse(body), null, 2));
                    } catch {
                        log('eureka_info (raw):', body.slice(0, 500));
                    }
                    resolve();
                });
            }
        );

        req.on('timeout', () => {
            log('eureka_info: no answer on port 8008 (many newer devices close it, this is normal)');
            req.destroy();
            resolve();
        });

        req.on('error', (e) => {
            log('eureka_info:', e.code || e.message);
            resolve();
        });
    });
}

function probeReceiver() {
    const client = new Client();
    let requestId = 0;

    client.on('error', (e) => {
        log('connection error:', e.message);
        process.exit(1);
    });

    client.connect(ip, () => {
        const channel = (ns) => client.createChannel('sender-0', 'receiver-0', ns, 'JSON');
        const connection = channel('urn:x-cast:com.google.cast.tp.connection');
        const heartbeat = channel('urn:x-cast:com.google.cast.tp.heartbeat');
        const receiver = channel('urn:x-cast:com.google.cast.receiver');

        connection.send({ type: 'CONNECT' });
        setInterval(() => heartbeat.send({ type: 'PING' }), 5000);

        receiver.on('message', (data) => log('<-', JSON.stringify(data)));

        log('-> GET_STATUS');
        receiver.send({ type: 'GET_STATUS', requestId: ++requestId });

        if (launchId) {
            setTimeout(() => {
                log('-> LAUNCH', launchId);
                receiver.send({ type: 'LAUNCH', appId: launchId, requestId: ++requestId });
            }, 1500);
        }

        setTimeout(() => {
            log('done');
            client.close();
            process.exit(0);
        }, launchId ? 20000 : 6000);
    });
}

(async () => {
    await fetchEurekaInfo();
    probeReceiver();
})();