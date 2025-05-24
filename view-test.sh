#!/bin/bash
set -eu -o pipefail

CONTAINER_ID=$(docker ps | grep xdotoolify-tests | awk '{print $1}')

if [ -z "$CONTAINER_ID" ]; then
    echo "Error: No test container running. Run test.sh first."
    exit 1
fi

echo "Starting x11vnc server in the container..."
docker exec -d $CONTAINER_ID x11vnc -display :50 -nopw -forever -verbose

if ! command -v remmina &> /dev/null; then
    echo "Installing remmina..."
    sudo apt update -y && sudo apt install -y remmina
fi

echo "Connecting to VNC server at localhost:5900..."
remmina -c vnc://localhost --set-option dynamic_resolution=1

function cleanup {
    echo "Stopping x11vnc server..."
    docker exec $CONTAINER_ID killall -9 x11vnc 2>/dev/null || true
}

trap cleanup EXIT
