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
    rpitube_server = cwd / "rpitube-server.js"
    start_server_py = cwd / "start-server.py"
    mobile_html_local = cwd / "mobile.html"

    log("Installing dependencies with Chocolatey...")
    run(f'choco install -y --limit-output vlc nodejs ffmpeg yt-dlp')

    log("Installing Express (npm) globally...")
    npm = which("npm") or which("npm.cmd")
    if not npm:
        err("npm not found after Node.js installation. Make sure your shell has a refreshed PATH or restart the terminal.")
    run(f'"{npm}" install express')

    log("Downloading scripts into current directory...")
    download_to(f"{RPITUBE_GIT_URL}/rpitube-server.js", rpitube_server)
    download_to(f"{RPITUBE_GIT_URL}/start-server.py", start_server_py)

    log("Fetching VLC HTML (mobile.html)...")
    download_to(f"{RPITUBE_GIT_URL}/vlc_html/mobile.html", mobile_html_local)

    log("Placing mobile.html into VLC HTTP directory...")
    placed = copy_mobile_html_to_vlc(mobile_html_local)
    if not placed:
        log(
            "Could not write to VLC directory automatically.\n"
            f"A copy is saved here: {mobile_html_local}\n"
            "To complete setup, copy it manually with admin rights to:\n"
            rf"  {get_vlc_http_dir()}\mobile.html"
        )

    log("Installation complete!")

if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        err(f"Command '{e.cmd}' failed with exit code {e.returncode}")
    except KeyboardInterrupt:
        err("Interrupted by user.", code=130)