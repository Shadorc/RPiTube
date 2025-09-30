const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
        const base = process.env["ProgramFiles"] || "C:\\Program Files";
        const vlcHttp = path.join(base, "VideoLAN", "VLC", "vlc.exe");
        return vlcHttp;
    }

    play(res, ip, url) {
        if (!fs.existsSync(this.cacheFolder)) {
            fs.mkdirSync(this.cacheFolder);
        }

        console.time('Downloading video');
        console.log(`Downloading video ${url}...`);
        if (!this.spawnSyncSafe('yt-dlp', [url, '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', '-o', `${this.cacheFolder}/%(title)s.%(ext)s`, '--merge-output-format', 'mkv', '--print-to-file', 'after_move:filepath', VIDEO_FILEPATH_FILE])) {
            console.error(`[ERROR] Downloading video failed`);
            return res.status(500).json({ error: "Downloading video failed" });
        }
        console.timeEnd('Downloading video');

        var videoFilepath;
        try {
            videoFilepath = fs.readFileSync(VIDEO_FILEPATH_FILE, 'utf-8').trim();
        } catch (err) {
            console.error(`[ERROR] Cannot read ${VIDEO_FILEPATH_FILE}\n`, err);
            return res.status(500).json({ error: `Error reading file ${VIDEO_FILEPATH_FILE}` });
        }

        console.log(`Casting ${url} to ${ip}...`);
        if (!this.spawnSyncSafe(this.getVlcExePath(), [videoFilepath, '-I', 'http', '--http-password', this.vlcPassword, '--sout', '#chromecast', `--sout-chromecast-ip=${ip}`, '--demux-filter=demux_chromecast', '--play-and-exit'])) {
            console.error(`[ERROR] Casting video failed`);
            return res.status(500).json({ error: "Casting video failed" });
        }

        return res.json({ success: true, message: `Cast stopped` });
    }

    cleanup() {
        if (fs.existsSync(VIDEO_FILEPATH_FILE)) {
            fs.unlinkSync(VIDEO_FILEPATH_FILE);
        }
    }
}

module.exports = VideoManager;