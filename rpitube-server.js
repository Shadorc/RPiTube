const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

const options = parseArgs();
const vlc_password = options['vlc-password'] || 'rpitube';

const video_filepath_file = 'video_filepath.txt' // Text file containing the path of the last doawnloaded video
const videos_dir = 'videos';
if (!fs.existsSync(videos_dir)) {
    fs.mkdirSync(videos_dir);
}

app.get('/cast/:ip/:url', function (req, res) {
    const ip = req.params.ip;
    const url = req.params.url;

    res.send(`Casting ${url} to Chromecast ${ip}`);

    console.log('Managing cache...');
    manageCache(videos_dir);

    // Delete previous file if it exist to avoid appending the filename
    if (fs.existsSync(video_filepath_file)) {
        fs.unlinkSync(video_filepath_file);
    }

    console.time('Downloading video');
    console.log(`Downloading video ${url}...`);
    if (!spawnSyncSafe('yt-dlp', [url, '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', '-o', `${videos_dir}/%(title)s.%(ext)s`, '--merge-output-format', 'mkv', '--print-to-file', 'after_move:filepath', video_filepath_file])) {
        console.log("Downloading video failed.");
        return;
    }
    console.timeEnd('Downloading video');

    var video_filepath;
    try {
        video_filepath = fs.readFileSync(video_filepath_file, 'utf-8').trim();
    } catch (err) {
        console.error(`Error reading file ${video_filepath_file}:`, err);
        return;
    }

    console.log(`Casting video to ${ip}...`);
    if (!spawnSyncSafe('vlc', [video_filepath, '-I', 'http', '--http-password', vlc_password, '--sout', '#chromecast', '--sout-chromecast-ip=${ip}', '--demux-filter=demux_chromecast', '--play-and-exit'])) {
        console.log("Casting video failed.");
        return;
    }

    console.log('Cast stopped!');
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
    try {
        const output = execSync('hostname -I', { encoding: 'utf8' });
        const ips = output.trim().split(/\s+/);
        return ips[0] || 'unknown';
    } catch (err) {
        console.error('Error getting local IP:', err);
        return 'unknown';
    }
}

function spawnSyncSafe(cmd, args) {
    try {
        spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf-8' });
        return true;
    } catch (error) {
        console.error('Command failed:');
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
