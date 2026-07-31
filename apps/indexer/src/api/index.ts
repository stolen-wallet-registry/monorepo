import { db } from 'ponder:api';
import schema from 'ponder:schema';
import { Hono } from 'hono';
import { graphql } from 'ponder';

import { enforceCors, parseAllowedOrigins, rateLimit, readRateLimitOptions } from './security.js';

const app = new Hono();

// NOTE: the `/sql/*` route (ponder's `client()` middleware) is deliberately NOT mounted.
// It exposes arbitrary read-only SQL over HTTP with no auth, rate limit, or origin
// restriction — unbounded full table scans and cross joins from any origin, i.e. a cheap
// DoS vector on a public deployment. Nothing in this repo calls it: every consumer
// (apps/web via packages/search, apps/landing) uses the GraphQL endpoints below.
// If a client ever needs `@ponder/client`, re-add it behind an API key.

// Order matters. `enforceCors` is outermost so that its post-response pass decorates every
// reply including the 429s produced below — a browser that cannot read the 429 sees an opaque
// network failure and cannot back off intelligently.
app.use('*', enforceCors(parseAllowedOrigins(process.env.INDEXER_ALLOWED_ORIGINS)));
app.use('*', rateLimit(readRateLimitOptions(process.env)));

// Ponder ships graphql-armor by default (maxOperationTokens 1000, maxOperationDepth 100,
// maxAliases 30, MAX_LIMIT 1000), so query *shape* attacks — depth, alias and pagination
// bombs — are already handled. The middleware above covers query *volume*, which armor does
// not address.
app.use('/', graphql({ db, schema }));
app.use('/graphql', graphql({ db, schema }));

export default app;
