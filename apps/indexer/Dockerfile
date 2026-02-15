FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

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

# Create non-root user
RUN groupadd --system appuser && useradd --system --gid appuser appuser
RUN chown -R appuser:appuser /app

WORKDIR /app/apps/indexer

EXPOSE 42069

# wget is available in node:22-slim (curl is not)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:42069/ready || exit 1

USER appuser

CMD ["pnpm", "start"]
