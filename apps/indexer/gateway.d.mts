/**
 * Types for gateway.mjs. The gateway is plain JS because it runs under bare `node` in the
 * container with no build step (see Dockerfile CMD) — this file gives `tsc` and the tests
 * the same signatures the JSDoc in gateway.mjs declares.
 */
import type { Server } from 'node:http';

export declare const DEFAULT_BLOCKED_PATHS: string[];
export declare const DEFAULT_LIMITED_PATHS: string[];
export declare const METRICS_PATH: string;
export declare const DEFAULT_PUBLIC_PORT: number;
export declare const DEFAULT_UPSTREAM_PORT: number;
export declare const DEFAULT_UPSTREAM_TIMEOUT_MS: number;
export declare const DEFAULT_HEADERS_TIMEOUT_MS: number;
export declare const DEFAULT_REQUEST_TIMEOUT_MS: number;
export declare const DEFAULT_LIMITED_PATH_MAX: number;
export declare const DEFAULT_LIMITED_PATH_WINDOW_MS: number;
export declare const DEFAULT_MAX_TRACKED_CLIENTS: number;

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
export declare function normaliseSocketAddress(address: string | undefined): string | undefined;
export declare function resolveForwardedClient(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
  trustProxyHops: number
): string;
export declare function isLoopback(address: string | undefined): boolean;
export declare function buildUpstreamHeaders(
  headers: Record<string, string | string[] | undefined>,
  clientKey: string
): Record<string, string | string[]>;
export declare function createRateLimiter(options: {
  maxRequests: number;
  windowMs: number;
  maxTrackedClients?: number;
  now?: () => number;
}): { check(key: string): { limited: boolean; retryAfterSeconds: number } };
export declare function createGatewayServer(options: {
  upstreamHost?: string;
  upstreamPort: number;
  blockedPaths?: readonly string[];
  limitedPaths?: readonly string[];
  metricsToken?: string;
  trustProxyHops?: number;
  upstreamTimeoutMs?: number;
  limitedPathMax?: number;
  limitedPathWindowMs?: number;
  now?: () => number;
}): Server;
