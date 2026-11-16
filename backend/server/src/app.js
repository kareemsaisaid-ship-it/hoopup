import Fastify from 'fastify';
import { InMemoryRateLimiter, assertJwtSecret } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOidcRoutes } from './routes/oidc.js';
import { registerRpcRoutes } from './routes/rpc.js';
import { registerDataRoutes } from './routes/data.js';
import { registerTilesRoutes } from './routes/tiles.js';
import { registerPlacesRoutes } from './routes/places.js';
import { registerPlacesSearchRoutes } from './routes/placesSearch.js';
import { UserStatusCache } from './user-status.js';

export function parseTrustProxy(val) {
  if (val === undefined || val === null || val === false || val === 'false') {
    return false;
  }
  if (typeof val === 'function') {
    return val;
  }
  if (val === true || val === 'true') {
    throw new Error(
      "Invalid TRUST_PROXY: 'true' is not allowed (spoofable). Provide specific proxy IPs/CIDRs or hop count."
    );
  }
  if (val === '*' || (typeof val === 'string' && val.trim() === '*')) {
    throw new Error(
      "Invalid TRUST_PROXY: '*' is not allowed (spoofable). Provide specific proxy IPs/CIDRs or hop count."
    );
  }
  if (typeof val === 'number') {
    if (val <= 0 || !Number.isInteger(val)) {
      throw new Error(`Invalid TRUST_PROXY: hop count must be a positive integer, got ${val}`);
    }
    return (addr, i) => i < val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') {
      throw new Error(
        "Invalid TRUST_PROXY: empty-but-set value is not allowed. Unset it or provide specific proxy IPs, CIDRs, or hop count."
      );
    }
    if (trimmed === 'false') {
      return false;
    }
    if (trimmed === 'true') {
      throw new Error(
        "Invalid TRUST_PROXY: 'true' is not allowed (spoofable). Provide specific proxy IPs/CIDRs or hop count."
      );
    }
    if (trimmed === '*') {
      throw new Error(
        "Invalid TRUST_PROXY: '*' is not allowed (spoofable). Provide specific proxy IPs/CIDRs or hop count."
      );
    }
    if (/^\d+$/.test(trimmed)) {
      const hops = parseInt(trimmed, 10);
      if (hops <= 0) {
        throw new Error(`Invalid TRUST_PROXY: hop count must be a positive integer, got ${hops}`);
      }
      return (addr, i) => i < hops;
    }
    const parts = trimmed.split(',').map((p) => p.trim());
    for (const p of parts) {
      if (!p) {
        throw new Error("Invalid TRUST_PROXY: contains empty IP/CIDR entry.");
      }
      if (p === '*' || p === 'true') {
        throw new Error(`Invalid TRUST_PROXY: '${p}' is not allowed (spoofable).`);
      }
    }
    return parts.length === 1 ? parts[0] : parts;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) {
      throw new Error("Invalid TRUST_PROXY: array cannot be empty.");
    }
    for (const p of val) {
      if (typeof p !== 'string' || !p.trim() || p.trim() === '*' || p.trim() === 'true') {
        throw new Error(`Invalid TRUST_PROXY: invalid or spoofable entry '${p}'.`);
      }
    }
    return val.map((p) => p.trim());
  }
  throw new Error(`Invalid TRUST_PROXY configuration: ${val}`);
}

export function buildApp(options = {}) {
  assertJwtSecret(options.jwtSecret || process.env.JWT_SECRET);

  const rawTrustProxy =
    options.trustProxy !== undefined
      ? options.trustProxy
      : process.env.TRUST_PROXY;
  const trustProxy = parseTrustProxy(rawTrustProxy);

  const allowedOriginsStr =
    options.allowedOrigins ||
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://localhost:5199';
  const allowedOrigins = new Set(
    allowedOriginsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const rateLimitMax =
    options.authRateLimitMax ||
    parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10);
  const rateLimitWindowMs =
    options.authRateLimitWindowMs ||
    parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000', 10);

  const rateLimiter = options.rateLimiter || new InMemoryRateLimiter({
    max: rateLimitMax,
    windowMs: rateLimitWindowMs,
  });

  // Fastify logger with strict redaction of sensitive credentials
  const loggerConfig = options.logger !== undefined
    ? options.logger
    : {
        level: process.env.LOG_LEVEL || 'info',
        serializers: {
          req(req) {
            let url = req.url;
            if (url && (url.startsWith('/auth/oidc/') || url === '/auth/oidc')) {
              const qIdx = url.indexOf('?');
              if (qIdx !== -1) {
                url = url.slice(0, qIdx);
              }
            }
            return {
              method: req.method,
              url,
              version: req.headers && req.headers['accept-version'],
              hostname: req.hostname,
              remoteAddress: req.ip,
              remotePort: req.socket ? req.socket.remotePort : undefined,
            };
          },
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'headers.authorization',
            'req.body.password',
            'body.password',
            'password',
            'accessToken',
            'id_token',
            'code',
            'state',
            'nonce',
            'verifier',
            'clientSecret',
            'client_secret',
            'req.body.code',
            'body.code',
          ],
          censor: '[REDACTED]',
        },
      };

  const app = Fastify({
    bodyLimit: 64 * 1024, // 64 kB hard limit
    logger: loggerConfig,
    trustProxy,
  });

  // Custom Helmet-like security headers hook (hand-rolled, zero external deps)
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    reply.header('Content-Security-Policy', "default-src 'none'");
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    return payload;
  });

  // Strict CORS hook
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;

    if (origin && allowedOrigins.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, If-None-Match');
      reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag');
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS') {
      if (origin && allowedOrigins.has(origin)) {
        return reply.status(204).send();
      }
      return reply.status(204).send();
    }
  });

  // B1: In-memory rate limiting only for credential endpoints (POST /auth/signup, POST /auth/login, POST /auth/oidc/exchange, GET /auth/oidc/:provider/start)
  app.addHook('onRequest', async (request, reply) => {
    // Match the registered route pattern, not the raw URL: the router decodes
    // percent-encoded characters ("/auth/%6cogin" reaches the login handler).
    const routePattern = request.routeOptions?.url;
    const isCredentialEndpoint =
      (request.method === 'POST' &&
        (routePattern === '/auth/signup' ||
          routePattern === '/auth/login' ||
          routePattern === '/auth/oidc/exchange')) ||
      (request.method === 'GET' && routePattern === '/auth/oidc/:provider/start');

    if (isCredentialEndpoint) {
      const clientIp = request.ip || request.socket?.remoteAddress || '127.0.0.1';
      const check = rateLimiter.check(clientIp);
      if (!check.allowed) {
        reply.header('Retry-After', Math.ceil(check.retryAfterMs / 1000));
        return reply.status(429).send({
          error: 'Too many attempts, please try again later',
        });
      }
    }
  });

  // GET /health - strictly no DB internals or connection details exposed
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  const userStatusCache =
    options.userStatusCache ||
    new UserStatusCache({
      ttlMs: options.userStatusCacheMs,
    });
  app.userStatusCache = userStatusCache;

  const routeOptions = { ...options, userStatusCache };

  // Register route groups
  registerAuthRoutes(app, routeOptions);
  registerOidcRoutes(app, routeOptions);
  registerRpcRoutes(app, routeOptions);
  registerDataRoutes(app, routeOptions);
  registerTilesRoutes(app, options);
  registerPlacesRoutes(app, options);
  registerPlacesSearchRoutes(app, options);

  // Test-only endpoint for verifying statement timeouts (opt-in via options.enableTestRoutes)
  if (options.enableTestRoutes) {
    app.get('/_test/sleep', async (request, reply) => {
      const { withTransaction } = await import('./db.js');
      const seconds = parseFloat(request.query.seconds || '1');
      try {
        await withTransaction(async (client) => {
          await client.query('SELECT pg_sleep($1);', [seconds]);
        });
        return reply.status(200).send({ ok: true });
      } catch (err) {
        if (err.code === '57014') {
          return reply.status(503).send({ error: 'Service temporarily unavailable' });
        }
        return reply.status(500).send({ error: 'Internal server error' });
      }
    });
  }

  // Store references for testing
  app.rateLimiter = rateLimiter;

  return app;
}
