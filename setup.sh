#!/bin/sh

echo "Installing dependencies..."
sudo apt-get install youtube-dl vlc node-express -y

sudo sh start-server.sh