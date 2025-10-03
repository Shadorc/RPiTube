const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('node:events');

const VIDEO_FILEPATH_FILE = 'video_filepath.txt' // Text file containing the path of the last downloaded video

const State = Object.freeze({
    STOPPED: 0,
    DOWNLOADING: 1,
    CASTING: 2,
    ERROR: 3,
    STOPPING: 4,
});

class VideoManager {
    constructor(vlcPassword, cacheFolder, isVerbose) {
        this.vlcPassword = vlcPassword;
        this.cacheFolder = cacheFolder;
        this.isVerbose = isVerbose;
        this.state = State.STOPPED;
        this.emitter = new EventEmitter();
    }

    async play(ip, url) {
        if (this.state === State.DOWNLOADING || this.state === State.CASTING) {
            await this.stop();
        }

        this.state = State.DOWNLOADING;

        if (!fs.existsSync(this.cacheFolder)) {
            fs.mkdirSync(this.cacheFolder);
        }

        if (fs.existsSync(VIDEO_FILEPATH_FILE)) {
            fs.unlinkSync(VIDEO_FILEPATH_FILE);
        }

        this.emitter.emit('info', `Downloading ${url}...`);
        const startTime = Date.now();

        this.downloadProcess = this.spawnWithLogs(
            'yt-dlp',
            [
                url,
                '-f', 'bestvideo[height<=1080][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=1080][vcodec^=avc][acodec^=mp4a]',
                '-o', `${this.cacheFolder}/%(title)s.%(ext)s`,
                '--merge-output-format', 'mkv',
                '--print-to-file',
                'after_move:filepath', VIDEO_FILEPATH_FILE,
                '--cookies', 'C:\\Users\\dcecc\\Downloads\\www.youtube.com_cookies.txt'
            ],
            this.isVerbose);

        try {
            await waitForClose(this.downloadProcess)
                .then(() => this.downloadProcess = null);
        } catch (err) {
            this.state = State.ERROR;
            this.emitter.emit('error', 'Downloading failed', err);
            await this.stop();
            return;
        }

        if (this.state === State.STOPPING) {
            return;
        }

        this.emitter.emit('info', `Downloaded in ${Date.now() - startTime} ms`);

        this.state = State.CASTING;

        let videoFilepath;
        try {
            videoFilepath = fs.readFileSync(VIDEO_FILEPATH_FILE, 'utf-8').trim();
        } catch (err) {
            this.state = State.ERROR;
            this.emitter.emit('error', 'Cannot read ${VIDEO_FILEPATH_FILE}', err);
            await this.stop();
            return;
        }

        this.emitter.emit('info', `Casting ${url}...`);

        this.vlcProcess = this.spawnWithLogs(
            getVlcExePath(),
            [
                videoFilepath,
                '-I', 'http',
                '--http-password', this.vlcPassword,
                '--sout', '#chromecast',
                `--sout-chromecast-ip=${ip}`,
                '--demux-filter=demux_chromecast',
                '--play-and-exit'
            ],
            this.isVerbose);

        try {
            await waitForClose(this.vlcProcess)
                .then(() => this.vlcProcess = null);;
        } catch (err) {
            this.state = State.ERROR;
            this.emitter.emit('error', 'Casting failed', err);
            await this.stop();
            return;
        }

        if (this.state === State.STOPPING) {
            return;
        }

        await this.stop();

        this.emitter.emit('info', `Casting ${url} finished`);
    }

    async stop() {
        this.state = State.STOPPING;

        async function killProcess(proc) {
            if (!proc || proc.killed) {
                return;
            }

            return new Promise(resolve => {
                proc.once('close', resolve);
                proc.once('error', resolve);
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

    spawnWithLogs(cmd, args, isVerbose) {
        if (isVerbose) {
            this.emitter.emit('info', `[VERBOSE] Spawning ${cmd} ${args.join(' ')}`);
        }

        const name = path.parse(cmd).name;
        const subprocess = spawn(cmd, args);

        subprocess.stdout.setEncoding('utf8');
        subprocess.stderr.setEncoding('utf8');

        subprocess.stdout.on('data', (data) => {
            const log = data.trim();
            this.emitter.emit('process_info', name, log);
        });

        subprocess.stderr.on('data', (data) => {
            const log = data.trim();
            this.emitter.emit('process_error', name, log);
        });

        return subprocess;
    }
}

function getVlcExePath() {
    // Default install path for VLC on Windows
    const rootPath = process.env["ProgramFiles"] || "C:\\Program Files";
    return path.join(rootPath, "VideoLAN", "VLC", "vlc.exe");
}

function waitForClose(proc) {
    return new Promise((resolve, reject) => {
        proc.once('close', resolve);
        proc.once('error', reject);
    });
}

module.exports = VideoManager;