const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('node:events');
const { Client, DefaultMediaReceiver } = require('castv2-client');
const ffmpegPath = require('ffmpeg-static');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const VIDEO_FILEPATH_FILE = 'video_filepath.txt'; // Text file containing the path of the last downloaded video

// Receiver app launched on the TV (the Default Media Receiver is not available on this TV)
const RECEIVER_APP_ID = '98AC7C3E';

const VIDEO_FORMAT = 'bestvideo[height<=1080][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=1080][vcodec^=avc][acodec^=mp4a]';

const State = Object.freeze({
    STOPPED: 0,
    DOWNLOADING: 1,
    CASTING: 2,
});

class VideoManager {
    constructor(cacheFolder, isVerbose, cookiesFile, mediaBaseUrl) {
        this.cacheFolder = cacheFolder;
        this.isVerbose = isVerbose;
        this.cookiesFile = cookiesFile;
        this.mediaBaseUrl = mediaBaseUrl;

        this.emitter = new EventEmitter();
        this.state = State.STOPPED;
        this.sessionId = 0; // Incremented by every play() and stop(), lets a running play() detect it was cancelled
        this.ytdlpProcess = null;
        this.player = null;
        this.endCast = null;
    }

    async play(ip, url) {
        if (this.state !== State.STOPPED) {
            await this.stop();
        }

        const session = ++this.sessionId;
        const isCancelled = () => session !== this.sessionId;

        this.state = State.DOWNLOADING;
        fs.mkdirSync(this.cacheFolder, { recursive: true });
        fs.rmSync(VIDEO_FILEPATH_FILE, { force: true });

        this.emitter.emit('info', `Downloading ${url}...`);
        const startTime = Date.now();

        this.ytdlpProcess = this.spawnWithLogs(getYtDlpPath(), this.buildYtDlpArgs(url), this.isVerbose);

        try {
            await waitForClose(this.ytdlpProcess);
        } catch (err) {
            return this.fail('Downloading failed', err);
        }
        this.ytdlpProcess = null;

        if (isCancelled()) {
            return;
        }

        this.emitter.emit('info', `Downloaded in ${Date.now() - startTime} ms`);
        this.state = State.CASTING;

        let fileName;
        try {
            fileName = path.basename(fs.readFileSync(VIDEO_FILEPATH_FILE, 'utf-8').trim());
        } catch (err) {
            return this.fail(`Cannot read ${VIDEO_FILEPATH_FILE}, download may have failed`, err);
        }

        const mediaUrl = `${this.mediaBaseUrl}/${encodeURIComponent(fileName)}`;
        this.emitter.emit('info', `Casting ${url} to ${ip}...`);
        if (this.isVerbose) {
            this.emitter.emit('info', `[VERBOSE] Media URL: ${mediaUrl}`);
        }

        try {
            await this.cast(ip, mediaUrl, fileName);
        } catch (err) {
            return this.fail('Casting failed', err);
        }

        if (isCancelled()) {
            return;
        }

        await this.stop();
        this.emitter.emit('info', `Finished casting ${url}`);
    }

    async stop() {
        this.sessionId++;

        if (this.ytdlpProcess) {
            await killProcess(this.ytdlpProcess);
            this.ytdlpProcess = null;
        }

        if (this.player) {
            try {
                this.player.stop(() => { });
            } catch {
                /* ignore */
            }
        }

        if (this.endCast) {
            this.endCast();
        }

        fs.rmSync(VIDEO_FILEPATH_FILE, { force: true });
        this.state = State.STOPPED;
    }

    async fail(message, err) {
        this.emitter.emit('error', message, err);
        await this.stop();
    }

    // Resolves when playback finishes or is stopped, rejects on error
    cast(ip, mediaUrl, title) {
        return new Promise((resolve, reject) => {
            const client = new Client();
            let ended = false;

            const end = (err) => {
                if (ended) {
                    return;
                }

                ended = true;
                this.player = null;
                this.endCast = null;
                try {
                    client.close();
                } catch {
                    /* already closed */
                }

                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            };

            this.endCast = end;
            client.on('error', end);

            (async () => {
                await new Promise((connected) => client.connect(ip, connected));

                const sessions = await withCallback((cb) => client.receiver.launch(RECEIVER_APP_ID, cb));
                const list = [].concat(sessions);
                const session = list.find((s) => s && s.appId === RECEIVER_APP_ID) || list[0];
                if (!session) {
                    throw new Error('Receiver app launched but no session was returned');
                }
                if (ended) {
                    return;
                }

                const player = await withCallback((cb) => client.join(session, DefaultMediaReceiver, cb));
                if (ended) {
                    return;
                }

                this.player = player;
                player.on('status', (status) => this.onPlayerStatus(status, end));

                const media = {
                    contentId: mediaUrl,
                    contentType: 'video/mp4',
                    streamType: 'BUFFERED',
                    metadata: { type: 0, metadataType: 0, title },
                };
                await withCallback((cb) => player.load(media, { autoplay: true }, cb));
            })().catch(end);
        });
    }

    onPlayerStatus(status, end) {
        if (this.isVerbose) {
            this.emitter.emit('info', `[VERBOSE] Player: ${status.playerState} ${status.idleReason || ''}`);
        }

        if (status.playerState !== 'IDLE') {
            return;
        }

        if (status.idleReason === 'FINISHED') {
            end();
        } else if (status.idleReason === 'ERROR') {
            end(new Error('The Chromecast could not play this media'));
        }
    }

    buildYtDlpArgs(url) {
        const args = [
            url,
            '-f', VIDEO_FORMAT,
            '-o', path.join(this.cacheFolder, '%(title)s.%(ext)s'),
            '--merge-output-format', 'mp4',
            '--print-to-file', 'after_move:filepath', VIDEO_FILEPATH_FILE,
        ];

        if (ffmpegPath) {
            args.push('--ffmpeg-location', ffmpegPath);
        }

        if (this.cookiesFile) {
            args.push('--cookies', this.cookiesFile);
        }

        return args;
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
            this.emitter.emit('info', `[${name}] ${data.trim()}`);
        });

        subprocess.stderr.on('data', (data) => {
            this.emitter.emit('error', `[${name}] ${data.trim()}`, null);
        });

        return subprocess;
    }
}

function getYtDlpPath() {
    const local = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    // Prefer the copy downloaded by `npm run setup`, fall back to one on PATH
    return fs.existsSync(local) ? local : 'yt-dlp';
}

// Turns a node-style callback API into a promise: withCallback((cb) => obj.method(arg, cb))
function withCallback(fn) {
    return new Promise((resolve, reject) => {
        fn((err, result) => (err ? reject(err) : resolve(result)));
    });
}

function killProcess(proc) {
    if (!proc || proc.killed) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        proc.once('close', resolve);
        proc.once('error', resolve);
        proc.kill();
    });
}

function waitForClose(proc) {
    return new Promise((resolve, reject) => {
        proc.once('close', resolve);
        proc.once('error', reject);
    });
}

module.exports = VideoManager;