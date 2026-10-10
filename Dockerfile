FROM node:20-bookworm-slim

# ffmpeg: audio/media features, curl: used by the shared HTTP helper
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p session database && chown -R node:node /app

ENV NODE_ENV=production
USER node

EXPOSE 3000
CMD ["node", "index.js"]
