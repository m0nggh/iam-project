# syntax=docker/dockerfile:1
#
# Multi-stage build for the IAM security group sync API.
#   build   – installs all dependencies and compiles TypeScript (src/ → dist/)
#   deps    – installs production dependencies only
#   runtime – the final image: Node + production node_modules + compiled dist/, nothing else
#
# Build:  docker build -t iam-group-sync .
# Run:    docker run --rm -p 3000:3000 --env-file .env -e MONGODB_URI=mongodb://host.docker.internal:27018/iam iam-group-sync
#         (host.docker.internal = "my machine" as seen from inside a container, e.g. the `npm run setup` MongoDB)

# Pin the Node major version in one place; Alpine keeps the base image small (~50 MB).
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

# ---- Stage 1: build ------------------------------------------------------------
FROM base AS build
# Copy only the dependency manifests first. Docker caches this layer, so `npm ci` re-runs
# only when package*.json changes – not on every source edit.
COPY package.json package-lock.json ./
# `npm ci` installs exactly what package-lock.json says (reproducible, unlike `npm install`).
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: production dependencies -------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# Skip devDependencies (TypeScript, ESLint, Vitest…): smaller image, smaller attack surface.
RUN npm ci --omit=dev && npm cache clean --force

# ---- Stage 3: runtime -------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000

# Only the compiled output and production modules ship – no TypeScript source, no compiler.
# --chown gives the files to the unprivileged `node` user that the official image provides.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# Never run as root: if the app were compromised, the attacker would not own the container.
USER node

# Documentation only – the port is actually published with `-p` / compose `ports:`.
EXPOSE 3000

# Lets Docker (and orchestrators) know whether the app is really working, not just running.
# /health returns 503 when MongoDB is unreachable, which marks the container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Exec form (JSON array) makes node PID 1 so it receives SIGTERM from `docker stop`
# and can shut down gracefully (see src/server.ts).
CMD ["node", "dist/server.js"]
