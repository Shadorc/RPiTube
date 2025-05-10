const { execSync } = require('child_process');
const express = require('express');
const app = express();

app.get('/cast/:ip/:url', function (req, res) {
    const ip = req.params.ip;
    const url = req.params.url;

    console.log(`Downloading video ${url}...`);
    execSync(`youtube-dl ${url} -f mp4 -o video`);

    console.log(`Casting video to ${ip}...`);
    execSync(`vlc video.mp4 -I http --http-password 'rpitube' --sout '#chromecast' --sout-chromecast-ip=${ip} --demux-filter=demux_chromecast`);

    res.send(`Casting ${url} to Chromecast ${ip}`);
});

var srv = app.listen(3000, function () {
    var host = getLocalIP();
    var port = srv.address().port;

    console.log('Access at http://%s:%s', host, port);
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
