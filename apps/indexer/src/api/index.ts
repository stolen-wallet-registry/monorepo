import { db } from 'ponder:api';
import schema from 'ponder:schema';
import { Hono } from 'hono';
import { graphql } from 'ponder';

import {
  enforceCors,
  limitQueryOffset,
  parseAllowedOrigins,
  rateLimit,
  readMaxOffset,
  readRateLimitOptions,
} from './security.js';

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
// maxAliases 30, MAX_LIMIT 1000), so depth and alias attacks are handled, and `rateLimit`
// above covers query *volume*. What none of them look at is the COST of a single permitted
// query: armor inspects a document's shape, never its argument values, and ponder caps
// `limit` but not `offset`. `limitQueryOffset` closes that — see its doc comment.
//
// Request-body size is bounded one layer out, in `gateway.mjs`, which is the only place that
// can reject before the bytes are proxied and the only one that also covers ponder's own
// ungatable `/metrics|/health|/ready|/status` routes. See DEFAULT_MAX_BODY_BYTES there.
app.use('*', limitQueryOffset(readMaxOffset(process.env)));

app.use('/', graphql({ db, schema }));
app.use('/graphql', graphql({ db, schema }));

export default app;
