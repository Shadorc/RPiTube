const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('node:events');
const { execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static'); // path string, or null on unsupported platforms

const BIN_DIR = path.join(__dirname, '..', 'bin');
const VIDEO_FILEPATH_FILE = 'video_filepath.txt' // Text file containing the path of the last downloaded video

const State = Object.freeze({
    STOPPED: 0,
    DOWNLOADING: 1,
    CASTING: 2,
    ERROR: 3,
    STOPPING: 4,
});

class VideoManager {
    constructor(vlcPassword, cacheFolder, isVerbose, cookiesFile) {
        this.vlcPassword = vlcPassword;
        this.cacheFolder = cacheFolder;
        this.isVerbose = isVerbose;
        this.cookiesFile = cookiesFile;

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

        let ytdlpProcessArgs = [
            url,
            '-f', 'bestvideo[height<=1080][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=1080][vcodec^=avc][acodec^=mp4a]',
            '-o', path.join(this.cacheFolder, '%(title)s.%(ext)s'),
            '--merge-output-format', 'mkv',
            '--print-to-file',
            'after_move:filepath', VIDEO_FILEPATH_FILE
        ];

        if (ffmpegPath) {
            ytdlpProcessArgs.push('--ffmpeg-location', ffmpegPath);
        }

        if (this.cookiesFile) {
            ytdlpProcessArgs.push('--cookies', this.cookiesFile);
        }

        this.ytdlpProcess = this.spawnWithLogs(getYtDlpPath(), ytdlpProcessArgs, this.isVerbose);

        try {
            await waitForClose(this.ytdlpProcess)
                .then(() => this.ytdlpProcess = null);
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
            this.emitter.emit('error', `Cannot read ${VIDEO_FILEPATH_FILE}`, err);
            await this.stop();
            return;
        }

        this.emitter.emit('info', `Casting ${url}...`);

        const vlc = getVlcCommand();
        if (!vlc) {
            this.emitter.emit('error', 'Cannot find VLC');
            return;
        }

        this.vlcProcess = this.spawnWithLogs(
            vlc.cmd,
            [
                ...vlc.prefix,
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

        this.emitter.emit('info', `Finished casting ${url}`);
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

        if (this.ytdlpProcess) {
            await killProcess(this.ytdlpProcess);
            this.ytdlpProcess = null;
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
            this.emitter.emit('info', `[${name}] ${log}`);
        });

        subprocess.stderr.on('data', (data) => {
            const log = data.trim();
            this.emitter.emit('error', `[${name}] ${log}`, null);
        });

        return subprocess;
    }
}

function getYtDlpPath() {
    const local = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    // Prefer the copy downloaded by `npm run setup`, fall back to one on PATH
    return fs.existsSync(local) ? local : 'yt-dlp';
}

function getVlcCommand() {
    if (process.platform === 'win32') {
        const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']];
        for (const root of roots.filter(Boolean)) {
            const exe = path.join(root, 'VideoLAN', 'VLC', 'vlc.exe');
            if (fs.existsSync(exe)) {
                return { cmd: exe, prefix: [] };
            }
        }
        return { cmd: 'vlc.exe', prefix: [] };
    }

    try {
        execSync('flatpak info org.videolan.VLC', { stdio: 'ignore' });
        return { cmd: 'flatpak', prefix: ['run', 'org.videolan.VLC'] };
    } catch {}
    
    return null;
}

function waitForClose(proc) {
    return new Promise((resolve, reject) => {
        proc.once('close', resolve);
        proc.once('error', reject);
    });
}

module.exports = VideoManager;