FROM node:22-bookworm-slim

ENV PATH="/opt/chordpilot-venv/bin:${PATH}" \
    PORT=3000 \
    CHORDPILOT_DATA_ROOT=/data \
    CHORDPILOT_PYTHON=/opt/chordpilot-venv/bin/python \
    CHORDPILOT_FFMPEG=/usr/bin/ffmpeg \
    CHORDPILOT_YTDLP=/opt/chordpilot-venv/bin/yt-dlp \
    CHORDPILOT_CACHE_DIR=/data/cache \
    CHORDPILOT_AUTO_INSTALL_DEMUCS=0 \
    TORCH_HOME=/data/cache/torch

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        curl \
        ffmpeg \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/chordpilot-venv

COPY requirements-web.txt ./
RUN /opt/chordpilot-venv/bin/pip install --no-cache-dir --require-hashes -r requirements-web.txt \
    && /opt/chordpilot-venv/bin/python -c "import demucs, essentia, librosa, music21, numpy, scipy, soundfile; print('python audio stack ok')" \
    && ffmpeg -version \
    && /opt/chordpilot-venv/bin/yt-dlp --version

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . ./

RUN mkdir -p /data/home /data/cache /data/config /data/share /data/tmp \
    && chown -R node:node /data

ARG CHORDPILOT_BUILD_TIME=""
ENV CHORDPILOT_BUILD_TIME=${CHORDPILOT_BUILD_TIME} \
    HOME=/data/home \
    XDG_CACHE_HOME=/data/cache \
    XDG_CONFIG_HOME=/data/config \
    XDG_DATA_HOME=/data/share \
    TMPDIR=/data/tmp

USER node

EXPOSE 3000

CMD ["npm", "run", "start:web"]
