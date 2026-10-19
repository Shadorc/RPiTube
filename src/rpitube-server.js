// Enable castv2 protocol logging when --verbose is given (must run before castv2-client loads)
if (process.argv.includes('--verbose')) {
    process.env.DEBUG = [process.env.DEBUG, 'castv2*'].filter(Boolean).join(',');
}

const express = require('express');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const VideoManager = require('./video-manager');
const discoverChromecasts = require('./detect-chromecast');
const { parseArgs, isValidURL } = require('./utils');

const BANNER = `
        ____________ _ _____     _          
        | ___ \\ ___ (_)_   _|   | |         
        | |_/ / |_/ /_  | |_   _| |__   ___ 
        |    /|  __/| | | | | | | '_ \\ / _ \\
        | |\\ \\| |   | | | | |_| | |_) |  __/
        \\_| \\_\\_|   |_| \\_/\\__,_|_.__/ \\___|                                    
        `;

const options = parseArgs();
const port = Number(options.get('port')) || 3000;
const cacheFolder = options.get('cache-folder') || 'videos';
const isVerbose = options.has('verbose');
const cookiesFile = options.get('cookies') || null;

const localIp = getLocalIP();
// URL the Chromecast uses to fetch the downloaded video from this server
const mediaBaseUrl = `http://${localIp}:${port}/media`;
const videoManager = new VideoManager(cacheFolder, isVerbose, cookiesFile, mediaBaseUrl);

const logClients = new Set();
let chromecastAddress = null;

// Logs

function sendLog(log) {
    for (const client of logClients) {
        client.write(`${log}\n`);
    }
}

function closeLogClient(client) {
    logClients.delete(client);
    client.end();
}

videoManager.emitter.on('info', (log) => {
    console.log(`[${new Date().toISOString()}] ${log}`);
    sendLog(log);
});

videoManager.emitter.on('error', (log, err) => {
    const str = `[ERROR] ${log}`;
    if (err) {
        console.error(`[${new Date().toISOString()}] ${str}`, err);
        sendLog(str);
        sendLog(String(err));
    } else {
        console.error(`[${new Date().toISOString()}] ${str}`);
        sendLog(str);
    }
});

process.on('SIGINT', async () => {
    await videoManager.stop();
    logClients.forEach(closeLogClient);
    process.exit(130);
});

// Routes

const app = express();
app.use(express.json());

// Serve downloaded videos to the Chromecast (express.static supports range requests)
app.use('/media', express.static(path.resolve(cacheFolder), {
    setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
}));

app.post('/cast', (req, res) => {
    if (!chromecastAddress) {
        return res.status(503).json({ error: 'Chromecast not ready yet' });
    }

    const { url } = req.body;
    if (!isValidURL(url)) {
        console.error(`[ERROR] Invalid URL: ${url}`);
        return res.status(400).json({ error: 'Invalid URL' });
    }

    manageCache(cacheFolder);

    res.sendFile(path.join(__dirname, 'public', 'index.html'));

    videoManager.play(chromecastAddress, url);
});

app.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    logClients.add(res);
    req.on('close', () => closeLogClient(res));
});

// Startup

app.listen(port, async (error) => {
    if (error) {
        fail(`Cannot listen on port ${port}: ${error.message}`);
    }

    console.log(BANNER);
    console.log(`Listening on: ${localIp}:${port}`);
    console.log(`Media URL base: ${mediaBaseUrl}`);
    console.log('Scanning for Chromecasts...');

    const { name, location, ip } = await findChromecast();
    chromecastAddress = ip;

    console.log(`Found ${name} (${location}) at ${ip}`);
    console.log('-------------------------------------------------------------------');
});

// Helpers

function fail(message) {
    console.error(message);
    process.exit(1);
}

async function findChromecast() {
    const devices = await discoverChromecasts();
    if (devices.length === 0) {
        fail('No Chromecasts found');
    }

    if (isVerbose) {
        devices.forEach(logDevice);
    }

    if (devices.length > 1) {
        console.log('Multiple Chromecasts found, using first one');
    }

    // Link-local IPv6 addresses don't work, so only consider devices with an IPv4 address
    for (const device of devices) {
        const ip = device.addresses.find((address) => net.isIPv4(address));
        if (ip) {
            return { name: device.getTxtValue('md'), location: device.getTxtValue('fn'), ip };
        }
    }

    fail('No Chromecast with an IPv4 address found');
}

function logDevice(device, index) {
    console.log(`[VERBOSE] Device #${index + 1}`);
    console.log('[VERBOSE] Instance:', device.instance);
    console.log('[VERBOSE] Host:', device.host);
    console.log('[VERBOSE] Port:', device.port);
    console.log('[VERBOSE] IPs:', device.addresses.length > 0 ? device.addresses : '(none in MDNS packet)');
    if (device.txt && device.txt.length) {
        console.log('[VERBOSE] TXT:', device.txt);
    }
}

function getLocalIP() {
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses) {
            // Skip internal (loopback) and non-IPv4
            if (!address.internal && address.family === 'IPv4') {
                return address.address;
            }
        }
    }

    return 'unknown';
}

// Keeps only the `maxFiles` most recent files of the cache folder
function manageCache(dirPath, maxFiles = 5) {
    try {
        if (!fs.existsSync(dirPath)) {
            return;
        }

        const files = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => {
                const fullPath = path.join(dirPath, entry.name);
                return { path: fullPath, mtime: fs.statSync(fullPath).mtime };
            })
            .sort((a, b) => b.mtime - a.mtime); // Most recent first

        for (const file of files.slice(maxFiles)) {
            fs.unlinkSync(file.path);
        }
    } catch (err) {
        console.error('Error managing cache:', err);
    }
}