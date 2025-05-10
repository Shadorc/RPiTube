const { execSync } = require('child_process');
const express = require('express');
const app = express();

app.get('/cast/:ip/:url', function (req, res) {
    const ip = req.params.ip;
    const url = req.params.url;

    res.send(`Casting ${url} to Chromecast ${ip}`);

    console.time('download');
    console.log(`Downloading video ${url}...`);
    if (!execSyncSafe(`yt-dlp ${url} -f mp4 -o video.mp4`)) {
        console.log("Downloading video failed.");
        res.send("Downloading video failed");
        return;
    }
    console.timeEnd('download');

    console.log(`Casting video to ${ip}...`);
    if (!execSyncSafe(`vlc video.mp4 -I http --http-password 'rpitube' --sout '#chromecast' --sout-chromecast-ip=${ip} --demux-filter=demux_chromecast vlc://quit`)) {
        console.log("Casting video failed.");
        res.send("Casting video failed");
        return;
    }
});

var srv = app.listen(3000, function () {
    var host = getLocalIP();
    var port = srv.address().port;

    console.log('Access at http://%s:%s/cast/:chromecast-ip/:video-url', host, port);
    console.log('VLC interface at http://%s:8080', host);
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
        console.error(`  stdout: ${error.stdout?.toString()}`);
        console.error(`  stderr: ${error.stderr?.toString()}`);
        return false;
    }
}
