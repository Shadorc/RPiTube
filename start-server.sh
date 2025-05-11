#!/bin/sh

echo "Starting webservice..."
node rpitube-server.js "$@" # $@: pass all arguments to the js script