const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const net = require('net');
const app = express();
const os = require('os');

const options = parseArgs();
const vlc_password = options['vlc-password'] || 'rpitube';

const video_filepath_file = 'video_filepath.txt' // Text file containing the path of the last downloaded video
const videos_dir = 'videos';
if (!fs.existsSync(videos_dir)) {
    fs.mkdirSync(videos_dir);
}

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

    manageCache(videos_dir);

    // Delete previous file if it exist to avoid appending the filename
    if (fs.existsSync(video_filepath_file)) {
        fs.unlinkSync(video_filepath_file);
    }

    console.time('Downloading video');
    console.log(`Downloading video ${url}...`);
    if (!spawnSyncSafe('yt-dlp', [url, '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', '-o', `${videos_dir}/%(title)s.%(ext)s`, '--merge-output-format', 'mkv', '--print-to-file', 'after_move:filepath', video_filepath_file])) {
        console.error(`[ERROR] Downloading video failed`);
        return res.status(500).json({ error: "Downloading video failed" });
    }
    console.timeEnd('Downloading video');

    var video_filepath;
    try {
        video_filepath = fs.readFileSync(video_filepath_file, 'utf-8').trim();
    } catch (err) {
        console.error(`[ERROR] Cannot read ${video_filepath_file}\n`, err);
        return res.status(500).json({ error: `Error reading file ${video_filepath_file}` });
    }

    console.log(`Casting ${url} to ${ip}...`);
    if (!spawnSyncSafe(getVlcExePath(), [video_filepath, '-I', 'http', '--http-password', vlc_password, '--sout', '#chromecast', `--sout-chromecast-ip=${ip}`, '--demux-filter=demux_chromecast', '--play-and-exit'])) {
        console.error(`[ERROR] Casting video failed`);
        return res.status(500).json({ error: "Casting video failed" });
    }

    return res.json({ success: true, message: `Cast stopped` });
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

function getVlcExePath() {
    // Default install path for VLC on Windows
    const base = process.env["ProgramFiles"] || "C:\\Program Files";
    const vlcHttp = path.join(base, "VideoLAN", "VLC", "vlc.exe");
    return vlcHttp;
}

function spawnSyncSafe(cmd, args) {
    try {
        const result = spawnSync(cmd, args, { stdio: 'inherit', stderr: 'inherit', encoding: 'utf-8' });

        if (result.error) {
            console.error('[ERROR] Command failed:');
            console.error(`  message: ${result.error}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[ERROR] Command failed:');
        console.error(`  message: ${error.message}`);
        console.error(`  status: ${error.status}`);
        if (error.stdout) {
            console.error(`  stdout: ${error.stdout.toString()}`);
        }
        if (error.stderr) {
            console.error(`  stderr: ${error.stderr.toString()}`);
        }
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
