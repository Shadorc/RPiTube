import os
import sys
import shutil
import subprocess
from pathlib import Path
from urllib.request import urlopen

RPITUBE_GIT_URL = "https://raw.githubusercontent.com/Shadorc/RPiTube/master"

def log(msg: str) -> None:
    print(f"\033[1;32m[INFO]\033[0m {msg}")

def err(msg: str, code: int = 1) -> None:
    print(f"\033[1;31m[ERROR]\033[0m {msg}", file=sys.stderr)
    sys.exit(code)

def which(cmd: str) -> str | None:
    return shutil.which(cmd)

def run(cmd: str, check: bool = True) -> subprocess.CompletedProcess:
    # Use shell=True so Windows can locate choco/npm/cmd shims on PATH
    log(f"Running: {cmd}")
    return subprocess.run(cmd, shell=True, check=check)

def download_to(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"Downloading {url} -> {dest}")
    try:
        with urlopen(url) as r, open(dest, "wb") as f:
            f.write(r.read())
    except Exception as e:
        err(f"Failed to download {url}: {e}")

def get_vlc_http_dir() -> Path:
    # Default install path for VLC on Windows
    base = Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
    vlc_http = base / "VideoLAN" / "VLC" / "lua" / "http"
    return vlc_http

def copy_mobile_html_to_vlc(http_file: Path) -> bool:
    vlc_http_dir = get_vlc_http_dir()
    target = vlc_http_dir / "mobile.html"
    try:
        vlc_http_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(http_file, target)
        log(f"Copied mobile.html to VLC HTTP dir: {target}")
        return True
    except PermissionError:
        log("Permission denied copying to VLC directory (need Administrator).")
        return False
    except Exception as e:
        log(f"Could not copy mobile.html to VLC HTTP dir: {e}")
        return False

def main():
    if which("choco") is None:
        err(f"Missing required command: choco. Install Chocolatey: https://chocolatey.org/install and re-run as Administrator.")

    cwd = Path.cwd()
    
    log("Installing dependencies with Chocolatey...")
    run(f'choco install -y --limit-output vlc nodejs ffmpeg yt-dlp')

    log("Installing Express (npm)...")
    npm = which("npm") or which("npm.cmd")
    if not npm:
        err("npm not found after Node.js installation. Make sure your shell has a refreshed PATH or restart the terminal.")
    run(f'"{npm}" install express')

    log("Downloading scripts into current directory...")
    
    SRC_FILES = ["rpitube-server.js", "video-manager.js", "detect-chromecast.js", "chromcast-data.js", "play-error.js"]
    for src_file in SRC_FILES:
        download_to(f"{RPITUBE_GIT_URL}/{src_file}", cwd / "src" / src_file)
    
    START_FILE = "start-server.py"
    download_to(f"{RPITUBE_GIT_URL}/{START_FILE}", cwd / START_FILE)

    log("Fetching VLC HTML (mobile.html)...")
    MOBILE_HTML_FILE = "mobile.html"
    download_to(f"{RPITUBE_GIT_URL}/vlc_html/{MOBILE_HTML_FILE}", cwd / MOBILE_HTML_FILE)

    log("Placing mobile.html into VLC HTTP directory...")
    placed = copy_mobile_html_to_vlc(MOBILE_HTML_FILE)
    if not placed:
        log(
            "Could not write to VLC directory automatically.\n"
            f"A copy is saved here: {cwd / MOBILE_HTML_FILE}\n"
            "To complete setup, copy it manually with admin rights to:\n"
            rf"  {get_vlc_http_dir()}\mobile.html"
        )

    log("Installation complete! You can execute 'py start-server.py'")

if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        err(f"Command '{e.cmd}' failed with exit code {e.returncode}")
    except KeyboardInterrupt:
        err("Interrupted by user.", code=130)