#!/bin/bash
set -eu -o pipefail

# Variable to store container ID
CONTAINER_ID=""

# Function to handle cleanup
cleanup() {
    echo "Stopping tests..."
    if [ -n "$CONTAINER_ID" ]; then
        echo "Stopping container $CONTAINER_ID..."
        docker kill $CONTAINER_ID >/dev/null 2>&1 || true
    fi
    exit 0
}

# Set up signal handler for Ctrl+C and other termination signals
trap cleanup INT TERM

# Build the Docker image
docker build -t xdotoolify-tests .

# Run the Docker container with tests
echo "Running tests..."
CONTAINER_ID=$(docker run --rm -d \
  -v "$(pwd):/app" \
  -p 5900:5900 \
  xdotoolify-tests \
  bash -c "Xvfb :50 -screen 0 1280x1024x24 2>/dev/null & fluxbox 2>/dev/null & npm run test -- $(printf '%q ' "$@")")

# Follow the logs until the container exits
docker logs -f $CONTAINER_ID
EXIT_CODE=$(docker wait $CONTAINER_ID)
exit $EXIT_CODE
