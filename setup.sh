#!/bin/sh
set -euo pipefail
# -e : exit on error
# -u : exit if undefined variable is used
# -o pipefail : catch errors in pipelines

RPITUBE_GIT_URL="https://raw.githubusercontent.com/Shadorc/RPiTube/master"

log() {
    printf "\033[1;32m[INFO]\033[0m %s\n" "$*"
}

err() {
    printf "\033[1;31m[ERROR]\033[0m %s\n" "$*" >&2
    exit 1
}

log "Installing dependencies..."

# Install VLC and node-express
apt-get install -y vlc node-express || err "Failed to install dependencies"

# Install youtube-dl
mkdir -p $HOME/.local/bin
wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O $HOME/.local/bin/yt-dlp || err "Failed to download yt-dlp"
chmod a+rx $HOME/.local/bin/yt-dlp  # Make executable

log "Configuring VLC..."
if [ -f /usr/bin/vlc ]; then
    # https://unix.stackexchange.com/questions/125546/how-to-run-vlc-player-in-root
    sed -i 's/geteuid/getppid/' /usr/bin/vlc || err "Failed to patch VLC binary"
else
    err "VLC not found at /usr/bin/vlc"
fi

wget $RPITUBE_GIT_URL/vlc_html/mobile.html -O /usr/share/vlc/lua/http/mobile.html || err "Failed to fetch VLC HTML file"

log "Downloading scripts..."
DIR=$PWD
wget -O $DIR/rpitube-server.js $RPITUBE_GIT_URL/rpitube-server.js || err "Failed to download rpitube-server.js"
wget -O $DIR/start-server.sh $RPITUBE_GIT_URL/start-server.sh || err "Failed to download start-server.sh"

log "Installation complete!"
