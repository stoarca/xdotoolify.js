FROM selenium/standalone-firefox:latest

USER root

# Install xdotool, fluxbox, xvfb, Node.js, and other dependencies
RUN apt-get update && \
    apt-get install -y \
    xdotool \
    fluxbox \
    x11vnc \
    xvfb \
    psmisc \
    curl && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Firefox configuration
ENV FIREFOX_BIN=/usr/bin/firefox
ENV DISPLAY=:50.0
ENV CHECKUNTIL_TIMEOUT=5000

# Set up working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

USER seluser
