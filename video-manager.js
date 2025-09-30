const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PlayError = require('./play-error');

const VIDEO_FILEPATH_FILE = 'video_filepath.txt' // Text file containing the path of the last downloaded video

const State = Object.freeze({
    STOPPED: 0,
    DOWNLOADING: 1,
    CASTING: 2,
    ERROR: 3,
    STOPPING: 4,
});

class VideoManager {
    constructor(vlcPassword, cacheFolder) {
        this.vlcPassword = vlcPassword;
        this.cacheFolder = cacheFolder;
        this.state = State.STOPPED;
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
        return new Promise(async (resolve, reject) => {
            if (this.state === State.DOWNLOADING || this.state === State.CASTING) {
                return this.stop();
            }

            this.state = State.DOWNLOADING;

            if (!fs.existsSync(this.cacheFolder)) {
                fs.mkdirSync(this.cacheFolder);
            }

            console.log(`Downloading ${url}...`);
            const startTime = Date.now();

            this.downloadProcess = this.spawnWithLogs('yt-dlp', [url, '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', '-o', `"${this.cacheFolder}/%(title)s.%(ext)s"`, '--merge-output-format', 'mkv', '--print-to-file', 'after_move:filepath', VIDEO_FILEPATH_FILE]);

            this.downloadProcess.on('error', async (err) => {
                this.state = State.ERROR;
                console.error(`[ERROR] Downloading failed\n`, err);
                await this.stop();
                reject(new PlayError(500, `Downloading failed: ${err.message}`));
            });

            this.downloadProcess.on('close', async () => {
                console.log('Downloading closed');

                if (this.state !== State.DOWNLOADING) {
                    return;
                }

                const elapsedMs = Date.now() - startTime;
                console.log(`Video downloaded in ${elapsedMs}ms`);

                this.state = State.CASTING;

                var videoFilepath;
                try {
                    videoFilepath = fs.readFileSync(VIDEO_FILEPATH_FILE, 'utf-8').trim();
                } catch (err) {
                    this.state = State.ERROR;
                    console.error(`[ERROR] Cannot read ${VIDEO_FILEPATH_FILE}\n`, err);
                    await this.stop();
                    reject(new PlayError(500, `Error reading file ${VIDEO_FILEPATH_FILE}`));
                    return;
                }

                console.log(`Casting ${url}...`);

                this.vlcProcess = this.spawnWithLogs(this.getVlcExePath(), [`"${videoFilepath}"`, '-I', 'http', '--http-password', `"${this.vlcPassword}"`, '--sout', '#chromecast', `--sout-chromecast-ip=${ip}`, '--demux-filter=demux_chromecast', '--play-and-exit']);

                this.vlcProcess.on('error', async (err) => {
                    this.state = State.ERROR;
                    console.error(`[ERROR] Casting failed`);
                    await this.stop();
                    reject(new PlayError(500, `Casting failed: ${err.message}`));
                });

                this.vlcProcess.on('close', async () => {
                    console.log('Casting closed');

                    if (this.state !== State.CASTING) {
                        return;
                    }

                    await this.stop();
                    resolve();
                });

            });
        })
    }

    async stop() {
        this.state = State.STOPPING;

        async function killProcess(proc) {
            if (!proc || proc.killed) {
                return;
            }

            return new Promise(resolve => {
                proc.once('close', resolve);
                proc.kill();
            });
        }

        if (this.downloadProcess) {
            await killProcess(this.downloadProcess);
            this.downloadProcess = null;
        }

        if (this.vlcProcess) {
            await killProcess(this.vlcProcess);
            this.vlcProcess = null;
        }

        if (fs.existsSync(VIDEO_FILEPATH_FILE)) {
            fs.unlinkSync(VIDEO_FILEPATH_FILE);
        }

        this.state = State.STOPPED;
    }
}

module.exports = VideoManager;