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

# Drop root
USER node

# Command to start the relay
CMD ["pnpm", "--filter", "@swr/relay", "start"]
