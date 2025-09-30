const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PlayError = require('./play-error');

const VIDEO_FILEPATH_FILE = 'video_filepath.txt' // Text file containing the path of the last downloaded video

class VideoManager {
    constructor(vlcPassword, cacheFolder) {
        this.vlcPassword = vlcPassword;
        this.cacheFolder = cacheFolder;
        this.isPlaying = false;
    }

    spawnWithLogs(cmd, args) {
        const subprocess = spawn(cmd, args);

        subprocess.stdout.setEncoding('utf8');
        subprocess.stderr.setEncoding('utf8');

        subprocess.stdout.on('data', (data) => {
            console.log(data.trim());
        });

        subprocess.stderr.on('data', (data) => {
            console.error(data.trim());
        });

        return subprocess;
    }

    getVlcExePath() {
        // Default install path for VLC on Windows
        const rootPath = process.env["ProgramFiles"] || "C:\\Program Files";
        return path.join(rootPath, "VideoLAN", "VLC", "vlc.exe");
    }

    play(ip, url) {
        return new Promise((resolve, reject) => {
            this.isPlaying = true;

            if (!fs.existsSync(this.cacheFolder)) {
                fs.mkdirSync(this.cacheFolder);
            }

            console.log(`Downloading video ${url}...`);
            console.time('Downloading video');

            const downloadProcess = this.spawnWithLogs('yt-dlp', [url, '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', '-o', `${this.cacheFolder}/%(title)s.%(ext)s`, '--merge-output-format', 'mkv', '--print-to-file', 'after_move:filepath', VIDEO_FILEPATH_FILE]);

            downloadProcess.on('error', (err) => {
                this.isPlaying = false;
                console.error(`[ERROR] Downloading video failed\n`, err);
                reject(new PlayError(500, `Downloading video failed: ${err.message}`));
            });

            downloadProcess.on('close', (code) => {
                console.timeEnd('Downloading video');

                var videoFilepath;
                try {
                    videoFilepath = fs.readFileSync(VIDEO_FILEPATH_FILE, 'utf-8').trim();
                } catch (err) {
                    this.isPlaying = false;
                    console.error(`[ERROR] Cannot read ${VIDEO_FILEPATH_FILE}\n`, err);
                    reject(new PlayError(500, `Error reading file ${VIDEO_FILEPATH_FILE}`));
                    return;
                }

                console.log(`Casting ${url}...`);

                const vlcProcess = this.spawnWithLogs(this.getVlcExePath(), [videoFilepath, '-I', 'http', '--http-password', this.vlcPassword, '--sout', '#chromecast', `--sout-chromecast-ip=${ip}`, '--demux-filter=demux_chromecast', '--play-and-exit']);

                vlcProcess.on('error', (err) => {
                    this.isPlaying = false;
                    console.error(`[ERROR] Casting video failed`);
                    reject(new PlayError(500, `Casting video failed: ${err.message}`));
                });

                vlcProcess.on('close', () => {
                    this.isPlaying = false;
                    resolve();
                });

            });
        })
    }

    stop() {
        this.isPlaying = false;
    }

    cleanup() {
        if (fs.existsSync(VIDEO_FILEPATH_FILE)) {
            fs.unlinkSync(VIDEO_FILEPATH_FILE);
        }
    }
}

module.exports = VideoManager;