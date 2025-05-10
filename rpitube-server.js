var exec = require('child_process').exec;
var express = require('express');
var app = express();

app.post('/cast/:ip/:url', function (req, res) {
    const ip = req.params.ip;
    const url = req.params.url;

    console.log(`Downloading at ${url}...`);
    exec(`youtube-dl ${url} -f mp4 -o video`);

    console.log(`Casting video...`);
    exec(`vlc video.mp4 -I http --http-password 'rpitube' --sout '#chromecast' --sout-chromecast-ip=${ip} --demux-filter=demux_chromecast`);
});

var srv = app.listen(3000, function () {
    var host = srv.address().address;
    var port = srv.address().port;

    console.log('Access at http://%s:%s', host, port);
});