// Enable castv2 protocol logging when --verbose is given (must run before castv2-client loads)
if (process.argv.includes('--verbose')) {
    process.env.DEBUG = [process.env.DEBUG, 'castv2*'].filter(Boolean).join(',');
}

const fs = require('fs');
const express = require('express');
const app = express();
const os = require('os');
const net = require('net');
const path = require('path');

const VideoManager = require('./video-manager');
const discoverChromecasts = require('./detect-chromecast');

const options = parseArgs();
const port = Number(options.get('port')) || 3000;
const cacheFolder = options.get('cache-folder') || 'videos';
const isVerbose = options.has('verbose') || false;
const cookiesFile = options.get('cookies') || null;
const chromecastIP = options.get('chromecast-ip') || null;

// URL the Chromecast uses to fetch the downloaded video from this server
const mediaBaseUrl = `http://${getLocalIP()}:${port}/media`;
const videoManager = new VideoManager(cacheFolder, isVerbose, cookiesFile, mediaBaseUrl);

let clients = [];
let chromecastAddress = chromecastIP; // set after discovery if not given on the command line

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
        sendLog(String(err));
    } else {
        console.error(`[${timestamp}] ${str}`);
        sendLog(str);
    }
});

process.on('SIGINT', async () => {
    await videoManager.stop();

    for (const client of [...clients]) {
        closeClient(client);
    }

    process.exit(130);
});

app.use(express.json());

// Serve downloaded videos to the Chromecast (express.static supports range requests)
app.use('/media', express.static(path.resolve(cacheFolder), {
    setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
}));

app.post('/cast', async (req, res) => {
    if (!chromecastAddress) {
        return res.status(503).json({ error: 'Chromecast not ready yet' });
    }

    const { url } = req.body;

    if (!isValidURL(url)) {
        console.error(`[ERROR] Invalid URL: ${url}`);
        return res.status(400).json({ error: 'Invalid URL' });
    }

    manageCache(cacheFolder);

    res.sendFile(path.join(__dirname, '/public/index.html'));

    return videoManager.play(chromecastAddress, url);
});

// Playback controls
function control(action) {
    return (req, res) => {
        action(req)
            .then(() => res.sendStatus(204))
            .catch((e) => res.status(409).json({ error: e.message }));
    };
}

app.post('/pause', control(() => videoManager.pause()));

app.post('/resume', control(() => videoManager.resume()));

app.post('/seek', control((req) => {
    const seconds = Number(req.body.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
        return Promise.reject(new Error('Invalid "seconds" value'));
    }
    return videoManager.seek(seconds);
}));

app.post('/stop', async (req, res) => {
    await videoManager.stop();
    res.sendStatus(204);
});

app.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    clients.push(res);

    req.on('close', () => closeClient(res));
});

app.listen(port, async (error) => {
    if (error) {
        console.error(`Cannot listen on port ${port}: ${error.message}`);
        process.exit(1);
    }

    console.log(`
        ____________ _ _____     _          
        | ___ \\ ___ (_)_   _|   | |         
        | |_/ / |_/ /_  | |_   _| |__   ___ 
        |    /|  __/| | | | | | | '_ \\ / _ \\
        | |\\ \\| |   | | | | |_| | |_) |  __/
        \\_| \\_\\_|   |_| \\_/\\__,_|_.__/ \\___|                                    
        `);

    console.log(`Listening on: ${getLocalIP()}:${port}`);
    console.log(`Media URL base: ${mediaBaseUrl}`);

    if (!chromecastAddress) {
        console.log('Scanning for Chromecasts...');
        const device = await getFirstChromecast();
        chromecastAddress = device.addresses.find((a) => net.isIPv4(a));
        const name = device.getTxtValue('md');
        const location = device.getTxtValue('fn');
        console.log(`Found ${name} (${location}) at ${chromecastAddress}`);
    } else {
        console.log(`Using Chromecast at ${chromecastAddress}`);
    }

    console.log('-------------------------------------------------------------------');
});

async function getFirstChromecast() {
    const devices = await discoverChromecasts();
    if (devices.length === 0) {
        console.error('No Chromecasts found');
        process.exit(1);
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
        console.log('Multiple Chromecasts found, using first one');
    }

    // Prefer a device that has an IPv4 address (link-local IPv6 addresses don't work)
    const device = devices.find((d) => d.addresses.some((a) => net.isIPv4(a)));
    if (!device) {
        console.error('No Chromecast with an IPv4 address found');
        process.exit(1);
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
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
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