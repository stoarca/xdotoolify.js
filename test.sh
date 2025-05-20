#!/bin/bash
set -e

# Build the Docker image
docker build -t xdotoolify-tests .

# Function to handle cleanup
cleanup() {
    echo "Stopping container..."
    exit 0
}

# Set up signal handler for Ctrl+C
trap cleanup INT TERM

# Run tests with proper signal handling
exec docker run --rm \
  -v "$(pwd):/app" \
  xdotoolify-tests \
  bash -c "Xvfb :50 -screen 0 1280x1024x24 2>/dev/null & sleep 2 && fluxbox 2>/dev/null & sleep 2 && npm run test -- $(printf '%q ' "$@")"
