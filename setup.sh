#!/bin/sh

echo "Installing dependencies..."
sudo apt-get install youtube-dl vlc node-express -y

echo "Starting webservice..."
sudo node rpitube-server.js