# Use an official Node.js runtime as the base image
FROM node:22-alpine

# Install pnpm.
#
# The version MUST match the root package.json `packageManager` field: corepack reads that
# field and resolves to it regardless of what was prepared here, so a mismatched `prepare`
# is a cache miss that silently re-downloads pnpm during `RUN pnpm install` below.
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

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

# Command to start the relay.
#
# `node` directly, NOT `pnpm --filter @swr/relay start`. The pnpm binary is a corepack shim
# that resolves the version from the root package.json `packageManager` field and looks it up
# in $COREPACK_HOME (~/.cache/node/corepack). That cache was populated as root during the
# install above, at /root/.cache — which the `node` user (HOME=/home/node) cannot read. Going
# through pnpm here would therefore re-resolve pnpm on every container start: a fresh download
# each boot where there is network egress, and a container that never comes up where there is
# not.
#
# Nothing is lost by skipping pnpm: the relay is pure JS with no build step and no workspace
# dependencies, and `pnpm start` only ever ran `node src/index.mjs`. Paths are safe from the
# changed working directory too — KEYS_PATH in src/config.mjs resolves against `import.meta.url`,
# not cwd, and Node resolves the libp2p imports from the importing file's directory
# (/app/apps/relay/node_modules) regardless of where the process was started.
CMD ["node", "apps/relay/src/index.mjs"]
