const fs = require('fs');
const express = require('express');
const app = express();
const os = require('os');
const path = require('path');

const VideoManager = require('./video-manager');
const discoverChromecasts = require('./detect-chromecast');

const options = parseArgs();
const port = options.get('port') || 3000;
const vlcPassword = options.get('vlc-password') || 'rpitube';
const cacheFolder = options.get('cache-folder') || 'videos';
const isVerbose = options.has('verbose') || false;
const cookiesFile = options.get('cookies') || null;
const chromecastIP = options.get('chromecast-ip') || null;
const videoManager = new VideoManager(vlcPassword, cacheFolder, isVerbose, cookiesFile);

let clients = [];

function sendLog(log) {
    for (const client of clients) {
        client.write(log + '\n');
    }
}

function closeClient(client) {
    const idx = clients.indexOf(client);
    if (idx > -1) {
        clients.splice(idx, 1);
    }
    if (!client.closed) {
        client.end();
    }
}

videoManager.emitter.on('info', (log) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${log}`);
    sendLog(log);
});

videoManager.emitter.on('error', (log, err) => {
    const timestamp = new Date().toISOString();
    const str = `[ERROR] ${log}`;
    if (err) {
        console.error(`[${timestamp}] ${str}`, err);
        sendLog(str);
        sendLog(err);
    } else {
        console.error(`[${timestamp}] ${str}`);
        sendLog(str);
    }
});

process.on("SIGINT", () => {
    videoManager.stop();

    for (const client of clients) {
        closeClient(client);
    }

    process.exit(130);
});

app.use(express.json());

var srv = app.listen(port, async () => {
    const host = getLocalIP();
    const port = srv.address().port;

    console.log(`
____________ _ _____     _          
| ___ \\ ___ (_)_   _|   | |         
| |_/ / |_/ /_  | |_   _| |__   ___ 
|    /|  __/| | | | | | | '_ \\ / _ \\
| |\\ \\| |   | | | | |_| | |_) |  __/
\\_| \\_\\_|   |_| \\_/\\__,_|_.__/ \\___|                                    
`);

    console.log(`Listening on: ${host}:${port}`);
    const vlcInterface = `http://${host}:8080`;
    console.log(`VLC interface: ${vlcInterface}`);

    let ip = chromecastIP;
    if (!ip) {
        console.log('Scanning for Chromecasts...');
        const device = await getFirstChromecast();
        const ip = device.addresses[0];
        const name = device.getTxtValue("md");
        const location = device.getTxtValue("fn");
        console.log(`Found ${name} (${location}) at ${ip}`);
    }

    console.log('-------------------------------------------------------------------');

    app.post('/cast', async (req, res) => {
        const { url } = req.body;

        if (!isValidURL(url)) {
            console.error(`[ERROR] Invalid URL: ${url}`);
            return res.status(400).json({ error: "Invalid URL" });
        }

        manageCache(cacheFolder);

        res.sendFile(path.join(__dirname, '/public/index.html'));

        return videoManager.play(ip, url);
    });

    app.get('/vlc', (req, res) => {
        return res.json({ address: `${vlcInterface}` });
    });

    app.get('/logs', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        clients.push(res);

        req.on('close', () => closeClient(res));
    });
});

async function getFirstChromecast() {
    const devices = await discoverChromecasts();
    if (devices.length === 0) {
        console.error('No Chromecasts found');
        process.exit(0);
    }

    if (isVerbose) {
        devices.forEach((d, i) => {
            console.log(`[VERBOSE] Device #${i + 1}`);
            console.log('[VERBOSE] Instance:', d.instance);
            console.log('[VERBOSE] Host:', d.host);
            console.log('[VERBOSE] Port:', d.port);
            console.log('[VERBOSE] IPs:', d.addresses.length > 0 ? d.addresses : '(none in MDNS packet)');
            if (d.txt && d.txt.length) {
                console.log('[VERBOSE] TXT:', d.txt);
            }
        });
    }

    if (devices.length > 1) {
        console.log("Multiple Chromecasts found, using first one");
    }

    const device = devices[0];
    if (device.addresses.length === 0) {
        console.error('Chromecast IP not found');
        process.exit(0);
    }

    return device;
}

function parseArgs() {
    const KEY_PREFIX = '--';

    const options = new Map();
    const args = process.argv; // First arg is path to node and second is path to script

    for (let i = 2; i < args.length; i++) {
        const arg = args[i];

        if (arg.startsWith(KEY_PREFIX)) {
            const key = arg.slice(KEY_PREFIX.length);

            let value = null;
            if (i + 1 < args.length && !args[i + 1].startsWith(KEY_PREFIX)) {
                value = args[i + 1];
                i++;
            }

            options.set(key, value);
        }
    }
    return options;
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4
            if (!iface.internal && iface.family === 'IPv4') {
                return iface.address;
            }
        }
    }

    return 'unknown';
}

function isValidURL(str) {
    try {
        const parsed = new URL(str);
        // Allow only http(s) protocols for safety
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (err) {
        return false;
    }
}

function manageCache(dirPath, maxFiles = 5) {
    try {
        if (!fs.existsSync(dirPath)) {
            return;
        }

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        const files = entries
            .filter(entry => entry.isFile())
            .map(entry => {
                const fullPath = path.join(dirPath, entry.name);
                const stats = fs.statSync(fullPath);
                return { path: fullPath, mtime: stats.mtime };
            });

        // Sort by modification time (most recent first)
        files.sort((a, b) => b.mtime - a.mtime);

        // Files to delete (after the first `maxFiles`)
        const filesToDelete = files.slice(maxFiles);

        for (const file of filesToDelete) {
            fs.unlinkSync(file.path);
        }
    } catch (err) {
        console.error('Error managing cache:', err);
    }
}
