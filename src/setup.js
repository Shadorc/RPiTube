const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

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
    fs.mkdirSync(BIN_DIR, { recursive: true });

    console.log(`Downloading ${file}...`);
    const res = await fetch(`${BASE}/${file}`);
    if (!res.ok) {
        throw new Error(`Download failed: HTTP ${res.status}`);
    }

    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
    fs.chmodSync(dest, 0o755);
    console.log(`Saved to ${dest}`);
}

function findVlc() {
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
        return (ok('where vlc') || fs.existsSync(exe)) ? 'native' : null;
    }

    if (ok('flatpak info org.videolan.VLC')) {
        return 'flatpak';
    }

    return null;
}

(async () => {
    await downloadYtDlp();

    const vlc = findVlc();
    if (vlc) {
        console.log(`VLC found (${vlc}).`);
    } else {
        console.log('VLC not found.');
    }

    console.log('\nSetup done. Start the server with: npm start');
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});