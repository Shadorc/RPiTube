const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PlayError = require('./play-error');

const VIDEO_FILEPATH_FILE = 'video_filepath.txt' // Text file containing the path of the last downloaded video

class VideoManager {
    constructor(vlcPassword, cacheFolder) {
        this.vlcPassword = vlcPassword;
        this.cacheFolder = cacheFolder;
    }

    spawnSyncSafe(cmd, args) {
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

    getVlcExePath() {
        // Default install path for VLC on Windows
        const rootPath = process.env["ProgramFiles"] || "C:\\Program Files";
        return path.join(rootPath, "VideoLAN", "VLC", "vlc.exe");
    }

    play(ip, url) {
        if (!fs.existsSync(this.cacheFolder)) {
            fs.mkdirSync(this.cacheFolder);
        }

        console.time('Downloading video');
        console.log(`Downloading video ${url}...`);
        if (!this.spawnSyncSafe('yt-dlp', [url, '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', '-o', `${this.cacheFolder}/%(title)s.%(ext)s`, '--merge-output-format', 'mkv', '--print-to-file', 'after_move:filepath', VIDEO_FILEPATH_FILE])) {
            console.error(`[ERROR] Downloading video failed`);
            throw new PlayError("Downloading video failed", 500);
        }
        console.timeEnd('Downloading video');

        var videoFilepath;
        try {
            videoFilepath = fs.readFileSync(VIDEO_FILEPATH_FILE, 'utf-8').trim();
        } catch (err) {
            console.error(`[ERROR] Cannot read ${VIDEO_FILEPATH_FILE}\n`, err);
            throw new PlayError(`Error reading file ${VIDEO_FILEPATH_FILE}`, 500);
        }

        console.log(`Casting ${url} to ${ip}...`);
        if (!this.spawnSyncSafe(this.getVlcExePath(), [videoFilepath, '-I', 'http', '--http-password', this.vlcPassword, '--sout', '#chromecast', `--sout-chromecast-ip=${ip}`, '--demux-filter=demux_chromecast', '--play-and-exit'])) {
            console.error(`[ERROR] Casting video failed`);
            throw new PlayError("Casting video failed", 500);
        }
    }

    cleanup() {
        if (fs.existsSync(VIDEO_FILEPATH_FILE)) {
            fs.unlinkSync(VIDEO_FILEPATH_FILE);
        }
    }
}

module.exports = VideoManager;