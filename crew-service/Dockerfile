# Recipe for packing Crew Service into a container.

# 1. Start from an official, small image that already has Node.js installed.
FROM node:24-alpine

# 2. All following commands run inside /app in the container.
WORKDIR /app

# 3. Copy only package files first and install. Docker caches this layer,
#    so packages are re-installed only when package.json changes - not on every code change.
COPY package*.json ./
RUN npm ci --omit=dev

# 4. Copy the source code.
COPY src ./src

# 5. Don't run as the all-powerful root user.
USER node

# 6. Document the port and the start command.
EXPOSE 3002
CMD ["node", "src/index.js"]
