const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const FORCE = process.argv.includes('--force');

function ytDlpAsset() {
    if (process.platform === 'win32') {
        return { file: 'yt-dlp.exe', local: 'yt-dlp.exe' };
    }

    if (process.platform === 'linux') {
        return { file: 'yt-dlp_linux', local: 'yt-dlp' };
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
}

async function downloadYtDlp() {
    const { file, local } = ytDlpAsset();
    const dest = path.join(BIN_DIR, local);

    if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        console.log(`yt-dlp found at ${dest}, use --force to re-download.`);
        return;
    }

    fs.mkdirSync(BIN_DIR, { recursive: true });

    console.log(`Downloading ${file}...`);
    const res = await fetch(`${BASE}/${file}`);
    if (!res.ok) {
        throw new Error(`Download failed: HTTP ${res.status}`);
    }

    // Write to a temp file first so an interrupted download never leaves a broken binary
    const tmp = `${dest}.part`;
    try {
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
        fs.chmodSync(tmp, 0o755);
        fs.renameSync(tmp, dest);
    } catch (err) {
        fs.rmSync(tmp, { force: true });
        throw err;
    }

    console.log(`Saved to ${dest}`);
}

function isVlcInstalled() {
    const ok = (cmd) => {
        try {
            execSync(cmd, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    };

    if (process.platform === 'win32') {
        const exe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'VideoLAN', 'VLC', 'vlc.exe');
        return ok('where vlc') || fs.existsSync(exe);
    }

    if (ok('command -v vlc') || ok('flatpak info org.videolan.VLC')) {
        return true;
    }

    return false;
}

(async () => {
    await downloadYtDlp();

    if (isVlcInstalled()) {
        console.log('VLC found.');
        console.log('\nSetup done. Start the server with: npm start');
    } else {
        console.error('VLC not found. You must install it to continue.');
    }
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});