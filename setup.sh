#!/bin/sh

echo "Installing dependencies..."
sudo apt-get install python3 pip vlc node-express -y
wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O ~/.local/bin/yt-dlp
chmod a+rx ~/.local/bin/yt-dlp  # Make executable

echo "Downloading scripts..."
DIR=$PWD
GIT_URL="https://raw.githubusercontent.com/Shadorc/RPiTube/master"
wget -O $DIR/rpitube-server.js $GIT_URL/rpitube-server.js
wget -O $DIR/start-server.sh $GIT_URL/start-server.sh

sudo sh start-server.sh