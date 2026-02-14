FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc* ./
COPY apps/indexer/package.json apps/indexer/
COPY packages/abis/package.json packages/abis/
COPY packages/chains/package.json packages/chains/
COPY packages/search/package.json packages/search/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/abis/ packages/abis/
COPY packages/chains/ packages/chains/
COPY packages/search/ packages/search/
COPY apps/indexer/ apps/indexer/

# Build workspace dependencies
RUN pnpm --filter @swr/chains build && \
    pnpm --filter @swr/abis build

WORKDIR /app/apps/indexer

EXPOSE 42069

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:42069/ready || exit 1

CMD ["pnpm", "start"]
