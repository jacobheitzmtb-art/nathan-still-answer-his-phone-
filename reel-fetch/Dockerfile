FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/reel-fetch-venv
WORKDIR /app
COPY requirements.txt ./
RUN /opt/reel-fetch-venv/bin/pip install --no-cache-dir -r requirements.txt
COPY --chown=node:node . .
RUN mkdir -p /app/.cache && chown node:node /app/.cache
ENV PYTHON=/opt/reel-fetch-venv/bin/python FFMPEG_PATH=/usr/bin/ffmpeg BIND_HOST=0.0.0.0 PORT=4178
USER node
EXPOSE 4178
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:4178/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
