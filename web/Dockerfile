# Recipe for packing the web front end into a container.
# Three stages: install packages -> build the app -> copy only the built result into a small final image.

# 1. Install packages (cached until package.json changes).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 2. Build the app. "standalone" output (see next.config.mjs) puts a ready-to-run server in .next/standalone.
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Final image: just the built server and its static files - no source code, no build tools.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Don't run as the all-powerful root user.
USER node

EXPOSE 3000
CMD ["node", "server.js"]
