#!/bin/sh

echo "Installing dependencies..."

# Install VLC and node-express
apt-get install vlc node-express -y

# Install youtube-dl
mkdir -p $HOME/.local/bin
wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O $HOME/.local/bin/yt-dlp
chmod a+rx $HOME/.local/bin/yt-dlp  # Make executable

echo "Configuring VLC..."
sed -i 's/geteuid/getppid/' /usr/bin/vlc #https://unix.stackexchange.com/questions/125546/how-to-run-vlc-player-in-root

echo "Downloading scripts..."
DIR=$PWD
GIT_URL="https://raw.githubusercontent.com/Shadorc/RPiTube/master"
wget -O $DIR/rpitube-server.js $GIT_URL/rpitube-server.js
wget -O $DIR/start-server.sh $GIT_URL/start-server.sh

sh start-server.sh