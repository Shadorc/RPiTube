const fs = require('fs');
const express = require('express');
const net = require('net');
const app = express();
const os = require('os');
const path = require('path');
const VideoManager = require('./video-manager')

const options = parseArgs();
const vlcPassword = options['vlc-password'] || 'rpitube';
const cacheFolder = options['cache-folder'] || 'videos';
const videoManager = new VideoManager(vlcPassword, cacheFolder);

app.get('/cast/:ip/:url', function (req, res) {
    const { ip, url } = req.params;

    if (net.isIP(ip) === 0) {
        console.error(`[ERROR] Invalid IP: ${ip}`);
        return res.status(400).json({ error: "Invalid IP address" });
    }

    if (!isValidURL(url)) {
        console.error(`[ERROR] Invalid URL: ${url}`);
        return res.status(400).json({ error: "Invalid URL" });
    }

    manageCache(cacheFolder);
    
    var response = videoManager.play(res, ip, url);
    videoManager.cleanup();

    return response;
});

var srv = app.listen(3000, function () {
    var host = getLocalIP();
    var port = srv.address().port;

    console.log(`
____________ _ _____     _          
| ___ \\ ___ (_)_   _|   | |         
| |_/ / |_/ /_  | |_   _| |__   ___ 
|    /|  __/| | | | | | | '_ \\ / _ \\
| |\\ \\| |   | | | | |_| | |_) |  __/
\\_| \\_\\_|   |_| \\_/\\__,_|_.__/ \\___|                                    
`);

    console.log('API URL: http://%s:%s/cast/:chromecast-ip/:video-url', host, port);
    console.log('VLC interface: http://%s:8080', host);
    console.log('-------------------------------------------------------------------');
});

function parseArgs() {
    const options = {};
    const args = process.argv.slice(2); // First arg is path to node and second is path to script
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        const value = args[i + 1];
        options[key] = value;
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
