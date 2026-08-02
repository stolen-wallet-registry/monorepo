/**
 * Types for gateway.mjs. The gateway is plain JS because it runs under bare `node` in the
 * container with no build step (see Dockerfile CMD) — this file gives `tsc` and the tests
 * the same signatures the JSDoc in gateway.mjs declares.
 */
import type { Server } from 'node:http';

export declare const DEFAULT_BLOCKED_PATHS: string[];
export declare const DEFAULT_PUBLIC_PORT: number;
export declare const DEFAULT_UPSTREAM_PORT: number;

export declare function parseBlockedPaths(raw: string | undefined): string[];
export declare function normalisePath(url: string | undefined): string;
export declare function isBlockedPath(
  url: string | undefined,
  blockedPaths: readonly string[]
): boolean;
export declare function hasValidMetricsToken(
  header: string | undefined,
  token: string | undefined
): boolean;
export declare function createGatewayServer(options: {
  upstreamHost?: string;
  upstreamPort: number;
  blockedPaths?: readonly string[];
  metricsToken?: string;
}): Server;
