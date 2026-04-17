# syntax=docker/dockerfile:1
FROM node:22.14.0-alpine3.21

# OCI standard image labels
LABEL org.opencontainers.image.source="https://github.com/pedrobarreira-ops/MarketPilot"
LABEL org.opencontainers.image.version="1.0.0-story-1.5"

# Install build tools needed by better-sqlite3 native bindings on Alpine (musl libc).
# better-sqlite3 v11 ships prebuilt binaries for glibc (Debian/Ubuntu) but NOT musl (Alpine).
# These tools are needed at build time only — they add ~50 MB to the build layer but are not
# present in the final image if you use multi-stage builds (optional future optimisation).
RUN apk add --no-cache python3 make g++

# Create /app as root, then hand ownership to the built-in 'node' user.
# Must be done before USER switch — WORKDIR as non-root creates dir owned by root.
WORKDIR /app
RUN chown node:node /app

# Switch to non-root for all subsequent instructions
USER node

# Install production deps only — copy package files first for layer caching
# --chown ensures files are owned by node user, not root
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source and static files
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/

# SQLite DB lives on a Docker volume mounted here at runtime
VOLUME ["/data"]

# Expose the port Fastify listens on (config.PORT defaults to 3000)
EXPOSE 3000

# Coolify polls this for container health; 30s start period accommodates BullMQ Redis connect
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the server (ESM; server.js starts Fastify + the imported queue module triggers Redis connection)
CMD ["node", "src/server.js"]
