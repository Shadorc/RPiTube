const { execSync } = require('child_process');
const fs = require('fs');
const express = require('express');
const app = express();

const video_filepath_file = 'video_filepath.txt' // Text file containing the path of the last doawnloaded video
const videos_dir = 'videos';
if (!fs.existsSync(videos_dir)) {
    fs.mkdirSync(videos_dir);
}

app.get('/cast/:ip/:url', function (req, res) {
    const ip = req.params.ip;
    const url = req.params.url;

    res.send(`Casting ${url} to Chromecast ${ip}`);

    console.time('Downloading video');
    console.log(`Downloading video ${url}...`);
    if (!execSyncSafe(`yt-dlp '${url}' -f 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' -o '${videos_dir}/%(title)s.%(ext)s' --print-to-file after_move:filepath '${video_filepath_file}`)) {
        console.log("Downloading video failed.");
        return;
    }
    console.timeEnd('Downloading video');

    var video_filepath;
    try {
        video_filepath = fs.readFileSync(video_filepath_file, 'utf-8');
    } catch (err) {
        console.error(`Error reading file ${video_filepath_file}:`, err);
        return;
    }

    console.log(`Casting video to ${ip}...`);
    if (!execSyncSafe(`vlc '${video_filepath}' -I http --http-password 'rpitube' --sout '#chromecast' --sout-chromecast-ip=${ip} --demux-filter=demux_chromecast --play-and-exit`)) {
        console.log("Casting video failed.");
        return;
    }

    console.log('Video stopped, deleting...');
    fs.unlinkSync(video_filepath);

    console.log('Done');
});

var srv = app.listen(3000, function () {
    var host = getLocalIP();
    var port = srv.address().port;

    console.log('API URL: http://%s:%s/cast/:chromecast-ip/:video-url', host, port);
    console.log('VLC interface: http://%s:8080', host);
});

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

function execSyncSafe(cmd) {
    try {
        execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
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
