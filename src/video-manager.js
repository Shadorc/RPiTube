const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('node:events');
const { Client, DefaultMediaReceiver } = require('castv2-client');
const ffmpegPath = require('ffmpeg-static');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const VIDEO_FILEPATH_FILE = 'video_filepath.txt'; // Text file containing the path of the last downloaded video

const RECEIVER_APP_ID = 'A9BCCB7C';

const State = Object.freeze({
    STOPPED: 0,
    DOWNLOADING: 1,
    CASTING: 2,
    ERROR: 3,
    STOPPING: 4,
});

class VideoManager {
    constructor(cacheFolder, isVerbose, cookiesFile, mediaBaseUrl) {
        this.cacheFolder = cacheFolder;
        this.isVerbose = isVerbose;
        this.cookiesFile = cookiesFile;
        this.mediaBaseUrl = mediaBaseUrl;

        this.state = State.STOPPED;
        this.emitter = new EventEmitter();
        this.ytdlpProcess = null;
        this.player = null;
        this.endCast = null;
    }

    async play(ip, url) {
        if (this.state === State.DOWNLOADING || this.state === State.CASTING) {
            await this.stop();
        }

        this.state = State.DOWNLOADING;

        if (!fs.existsSync(this.cacheFolder)) {
            fs.mkdirSync(this.cacheFolder, { recursive: true });
        }

        if (fs.existsSync(VIDEO_FILEPATH_FILE)) {
            fs.unlinkSync(VIDEO_FILEPATH_FILE);
        }

        this.emitter.emit('info', `Downloading ${url}...`);
        const startTime = Date.now();

        const ytdlpArgs = [
            url,
            '-f', 'bestvideo[height<=1080][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=1080][vcodec^=avc][acodec^=mp4a]',
            '-o', path.join(this.cacheFolder, '%(title)s.%(ext)s'),
            '--merge-output-format', 'mp4',
            '--print-to-file', 'after_move:filepath', VIDEO_FILEPATH_FILE
        ];

        if (ffmpegPath) {
            ytdlpArgs.push('--ffmpeg-location', ffmpegPath);
        }

        if (this.cookiesFile) {
            ytdlpArgs.push('--cookies', this.cookiesFile);
        }

        const ytdlpPath = getYtDlpPath();
        this.ytdlpProcess = this.spawnWithLogs(ytdlpPath, ytdlpArgs, this.isVerbose);

        try {
            await waitForClose(this.ytdlpProcess);
            this.ytdlpProcess = null;
        } catch (err) {
            this.state = State.ERROR;
            this.emitter.emit('error', 'Downloading failed', err);
            await this.stop();
            return;
        }

        if (this.state === State.STOPPING) {
            return;
        }

        const elapsed = Date.now() - startTime;
        this.emitter.emit('info', `Downloaded in ${elapsed} ms`);

        this.state = State.CASTING;

        let fileName;
        try {
            const videoFilepath = fs.readFileSync(VIDEO_FILEPATH_FILE, 'utf-8').trim();
            fileName = path.basename(videoFilepath);
        } catch (err) {
            this.state = State.ERROR;
            this.emitter.emit('error', `Cannot read ${VIDEO_FILEPATH_FILE}, download may have failed`, err);
            await this.stop();
            return;
        }

        const mediaUrl = `${this.mediaBaseUrl}/${encodeURIComponent(fileName)}`;
        this.emitter.emit('info', `Casting ${url} to ${ip}...`);
        if (this.isVerbose) {
            this.emitter.emit('info', `[VERBOSE] Media URL: ${mediaUrl}`);
        }

        try {
            await this.cast(ip, mediaUrl, fileName);
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

    cast(ip, mediaUrl, title) {
        return new Promise((resolve, reject) => {
            const client = new Client();
            let settled = false;

            this.endCast = (err) => {
                if (settled) {
                    return;
                }

                settled = true;
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

            client.on('error', this.endCast);

            client.connect(ip, () => {
                client.receiver.launch(RECEIVER_APP_ID, (err, sessions) => {
                    if (err) {
                        return this.endCast(err);
                    }

                    const list = Array.isArray(sessions) ? sessions : [sessions];
                    const session = list.find((s) => s && s.appId === RECEIVER_APP_ID) || list[0];
                    if (!session) {
                        return this.endCast(new Error('Receiver app launched but no session was returned'));
                    }

                    client.join(session, DefaultMediaReceiver, (err, player) => {
                        if (err) {
                            return this.endCast(err);
                        }

                        this.player = player;

                        player.on('status', (status) => {
                            if (this.isVerbose) {
                                this.emitter.emit('info', `[VERBOSE] Player: ${status.playerState} ${status.idleReason || ''}`);
                            }
                            if (status.playerState === 'IDLE') {
                                if (status.idleReason === 'FINISHED') {
                                    this.endCast();
                                } else if (status.idleReason === 'ERROR') {
                                    this.endCast(new Error('The Chromecast could not play this media'));
                                }
                            }
                        });

                        const media = {
                            contentId: mediaUrl,
                            contentType: 'video/mp4',
                            streamType: 'BUFFERED',
                            metadata: { type: 0, metadataType: 0, title },
                        };

                        player.load(media, { autoplay: true }, (err) => {
                            if (err) {
                                this.endCast(err);
                            }
                        });
                    });
                });
            });
        });
    }

    pause() {
        return this.#playerCall((player, cb) => player.pause(cb));
    }

    resume() {
        return this.#playerCall((player, cb) => player.play(cb));
    }

    seek(seconds) {
        return this.#playerCall((player, cb) => player.seek(seconds, cb));
    }

    #playerCall(fn) {
        return new Promise((resolve, reject) => {
            if (!this.player) {
                return reject(new Error('Nothing is playing'));
            }

            fn(this.player, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async stop() {
        this.state = State.STOPPING;

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