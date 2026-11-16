import { verifyAccessToken, InMemoryRateLimiter } from '../auth.js';
import { withTransaction } from '../db.js';
import {
  RPC_WHITELIST,
  buildRpcParameters,
  mapSqlError,
} from '../rpc-signatures.js';
import { getUserStatusCache } from '../user-status.js';

export function registerRpcRoutes(app, options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const userStatusCache =
    options.userStatusCache || app.userStatusCache || getUserStatusCache();

  const rpcRateLimitMax =
    options.rpcRateLimitMax ||
    parseInt(process.env.RPC_RATE_LIMIT_MAX || '120', 10);
  const rpcRateLimitWindowMs =
    options.rpcRateLimitWindowMs ||
    parseInt(process.env.RPC_RATE_LIMIT_WINDOW_MS || '60000', 10);

  const rpcRateLimiter =
    options.rpcRateLimiter ||
    new InMemoryRateLimiter({
      max: rpcRateLimitMax,
      windowMs: rpcRateLimitWindowMs,
    });

  const rpcStrictRateLimitMax =
    options.rpcStrictRateLimitMax || 20;
  const rpcStrictRateLimitWindowMs =
    options.rpcStrictRateLimitWindowMs || 60000;

  const rpcStrictRateLimiter =
    options.rpcStrictRateLimiter ||
    new InMemoryRateLimiter({
      max: rpcStrictRateLimitMax,
      windowMs: rpcStrictRateLimitWindowMs,
    });

  const STRICT_RPC_FUNCTIONS = new Set([
    'hoopup_send_message',
    'hoopup_create_session',
    'hoopup_report',
  ]);

  app.post('/rpc/:name', async (request, reply) => {
    const rawName = request.params.name;

    // B3: Hard whitelist lookup using Object.hasOwn; ensure prototype names & hoopup___proto__ are not resolvable
    let def = null;
    if (typeof rawName === 'string') {
      if (Object.hasOwn(RPC_WHITELIST, rawName)) {
        def = RPC_WHITELIST[rawName];
      } else if (!rawName.startsWith('__proto__') && rawName !== 'prototype' && rawName !== 'constructor' && Object.hasOwn(RPC_WHITELIST, 'hoopup_' + rawName)) {
        def = RPC_WHITELIST['hoopup_' + rawName];
      }
    }

    if (!def) {
      request.log.warn({ requestedFunction: rawName }, 'RPC function not found');
      return reply.status(404).send({
        ok: false,
        code: 'not_found',
        error: 'Function not found',
      });
    }

    // Authenticate token: all 15 hoopup_* functions are restricted to authenticated users
    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return reply.status(401).send({
        ok: false,
        code: 'unauthorized',
        error: 'Missing authorization header',
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        ok: false,
        code: 'unauthorized',
        error: 'Invalid or expired token',
      });
    }

    const token = authHeader.slice(7).trim();
    let payload;
    try {
      payload = await verifyAccessToken(token, jwtSecret);
    } catch (err) {
      request.log.warn({ errMessage: err.message }, 'JWT verification failed');
      return reply.status(401).send({
        ok: false,
        code: 'unauthorized',
        error: 'Invalid or expired token',
      });
    }

    const userId = payload.sub;
    if (!userId) {
      return reply.status(401).send({
        ok: false,
        code: 'unauthorized',
        error: 'Invalid or expired token',
      });
    }

    // BAN1: Check user status after token verification, before rate limiter and DB execution
    try {
      const status = await userStatusCache.get(userId);
      if (status !== 'active') {
        return reply.status(403).send({
          ok: false,
          code: 'account_suspended',
          error: 'Account unavailable',
        });
      }
    } catch (statusErr) {
      request.log.error({ err: statusErr }, 'User status check error');
      return reply.status(503).send({
        ok: false,
        code: 'service_unavailable',
        error: 'Service temporarily unavailable',
      });
    }

    // 3. Per-user limiter applied AFTER token is verified and before DB call
    const canonicalName = def.sqlName ? def.sqlName.replace(/^public\./, '') : rawName;
    if (STRICT_RPC_FUNCTIONS.has(canonicalName)) {
      const strictCheck = rpcStrictRateLimiter.check(userId);
      if (!strictCheck.allowed) {
        reply.header('Retry-After', Math.ceil(strictCheck.retryAfterMs / 1000));
        return reply.status(429).send({
          ok: false,
          code: 'rate_limited',
          error: 'Too many requests, please try again later',
        });
      }
    }

    const overallCheck = rpcRateLimiter.check(userId);
    if (!overallCheck.allowed) {
      reply.header('Retry-After', Math.ceil(overallCheck.retryAfterMs / 1000));
      return reply.status(429).send({
        ok: false,
        code: 'rate_limited',
        error: 'Too many requests, please try again later',
      });
    }

    // Build parameterized query values - strictly no string interpolation
    let params;
    try {
      params = buildRpcParameters(def, request.body);
    } catch (paramErr) {
      request.log.warn({ errMessage: paramErr.message }, 'RPC parameter building error');
      return reply.status(400).send({
        ok: false,
        code: 'invalid_input',
        error: 'Invalid input parameters',
      });
    }

    // Execute in one single transaction with GUC variables and SET LOCAL ROLE authenticated
    try {
      const result = await withTransaction(
        async (client) => {
          const res = await client.query(def.sql, params);
          return res.rows[0]?.result ?? null;
        },
        {
          uid: userId,
          claims: {
            sub: userId,
            email: payload.email,
            role: 'authenticated',
          },
          role: 'authenticated',
        }
      );

      // Return the JSON the function returns unchanged
      return reply.status(200).send(result);
    } catch (err) {
      request.log.warn({ errCode: err.code, errMsg: err.message }, 'RPC database execution error');
      const { status, body } = mapSqlError(err);
      return reply.status(status).send(body);
    }
  });

  // Store references for testing
  app.rpcRateLimiter = rpcRateLimiter;
  app.rpcStrictRateLimiter = rpcStrictRateLimiter;
}
