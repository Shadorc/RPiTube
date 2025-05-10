#!/bin/sh

echo "Installing dependencies..."
sudo apt-get install youtube-dl vlc node-express -y

echo "Creating directory..."
DIR="${PWD}/RPiTube"
mkdir $DIR

echo "Downloading scripts..."
GIT_URL="https://raw.githubusercontent.com/Shadorc/RPiTube/master"
wget -O $DIR/rpitube-server.js $GIT_URL/rpitube-server.js
wget -O $DIR/start-server.sh $GIT_URL/start-server.sh

sudo sh start-server.sh