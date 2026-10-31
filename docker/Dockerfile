# syntax=docker/dockerfile:1
# Étagère server image: the API, the realtime channel and the web app (PWA) on port 4848.
# Build from the repository root:  docker build -f docker/Dockerfile -t etagere .
# Release (maintainer):            npm run release:docker   (see docs/RELEASE.md)

# --- 1. Build the npm package exactly as it is published (server bundle + exported web app) ---
FROM node:24-alpine AS build
WORKDIR /src
ENV CI=1 \
    EXPO_NO_TELEMETRY=1
# Manifests first: the dependency layer stays cached while only the code changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY app/package.json app/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# `npm pack` runs the package's prepack: esbuild bundle, `expo export -p web`, license copy.
RUN mkdir /out && npm pack -w etagere-server --pack-destination /out

# --- 2. Runtime: only the published package and its production dependencies ---
FROM node:24-alpine
ARG VERSION=dev
LABEL org.opencontainers.image.title="Étagère" \
      org.opencontainers.image.description="Household book library server for the home Wi-Fi" \
      org.opencontainers.image.source="https://github.com/bibear/etagere" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production \
    PORT=4848 \
    ETAGERE_DATA_DIR=/data
WORKDIR /opt/etagere
COPY --from=build /out/ /tmp/pkg/
RUN npm install --omit=dev --no-audit --no-fund --no-save /tmp/pkg/etagere-server-*.tgz \
    && rm -rf /tmp/pkg /root/.npm \
    && mkdir -p /data \
    && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4848
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4848)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "/opt/etagere/node_modules/etagere-server/dist/index.js"]
