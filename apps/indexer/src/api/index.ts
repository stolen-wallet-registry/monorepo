import { db } from 'ponder:api';
import schema from 'ponder:schema';
import { Hono } from 'hono';
import { graphql } from 'ponder';

const app = new Hono();

// NOTE: the `/sql/*` route (ponder's `client()` middleware) is deliberately NOT mounted.
// It exposes arbitrary read-only SQL over HTTP with no auth, rate limit, or origin
// restriction — unbounded full table scans and cross joins from any origin, i.e. a cheap
// DoS vector on a public deployment. Nothing in this repo calls it: every consumer
// (apps/web via packages/search, apps/landing) uses the GraphQL endpoints below.
// If a client ever needs `@ponder/client`, re-add it behind an API key.

app.use('/', graphql({ db, schema }));
app.use('/graphql', graphql({ db, schema }));

export default app;
