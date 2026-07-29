# Use an official Node.js runtime as the base image
FROM node:22-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Set the working directory inside the container
WORKDIR /app

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/relay/package.json ./apps/relay/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @swr/relay

# Copy the relay application
# keys.json and .data/ are excluded via .dockerignore — the relay identity is
# supplied at runtime through RELAY_PRIVATE_KEY.
COPY apps/relay/ ./apps/relay/

# Expose the relay port
EXPOSE 12312

# Production mode is required: without NODE_ENV the startup falls into the dev
# key-generation branch, which tries to write keys.json into the (root-owned) app dir
# and dies on EACCES instead of the intended "run setup-keys / set RELAY_PRIVATE_KEY"
# fail-fast message.
ENV NODE_ENV=production

# Drop root. chown so the node user can read the app tree (and write nothing else —
# the relay identity comes from RELAY_PRIVATE_KEY at runtime, not from disk).
RUN chown -R node:node /app
USER node

# Command to start the relay
CMD ["pnpm", "--filter", "@swr/relay", "start"]
