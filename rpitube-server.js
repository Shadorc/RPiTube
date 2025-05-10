const { execSync } = require('child_process');
const fs = require('fs');
const { randomUUID } = require('crypto');
const express = require('express');
const app = express();

const video_dir = "videos";
if (!fs.existsSync(video_dir)) {
  fs.mkdirSync(video_dir);
}

app.get('/cast/:ip/:url', function (req, res) {
    const ip = req.params.ip;
    const url = req.params.url;

    const id = randomUUID();
    const filepath = `${video_dir}/video-${id}.mp4`;

    res.send(`Casting ${url} to Chromecast ${ip}`);

    console.time('download');
    console.log(`Downloading video ${url}...`);
    if (!execSyncSafe(`yt-dlp '${url}' -f mp4 -o '${filepath}'`)) {
        console.log("Downloading video failed.");
        return;
    }
    console.timeEnd('download');

    console.log(`Casting video to ${ip}...`);
    if (!execSyncSafe(`vlc '${filepath}' -I http --http-password 'rpitube' --sout '#chromecast' --sout-chromecast-ip=${ip} --demux-filter=demux_chromecast vlc://quit`)) {
        console.log("Casting video failed.");
        return;
    }

    console.log('Video finished');
    fs.unlinkSync(filepath);
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
