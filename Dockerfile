# syntax=docker/dockerfile:1
FROM node:22-alpine

# Install build tools needed by better-sqlite3 native bindings on Alpine (musl libc).
# better-sqlite3 v11 ships prebuilt binaries for glibc (Debian/Ubuntu) but NOT musl (Alpine).
# These tools are needed at build time only — they add ~50 MB to the build layer but are not
# present in the final image if you use multi-stage builds (optional future optimisation).
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Install production dependencies first (layer caching — deps change less often than src)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source and static files
COPY src/ ./src/
COPY public/ ./public/

# Run as non-root node user (built into node:22-alpine)
USER node

# Expose the port Fastify listens on (config.PORT defaults to 3000)
EXPOSE 3000

# Start the server (ESM; server.js starts Fastify + the imported queue module triggers Redis connection)
CMD ["node", "src/server.js"]
