import { verifyAccessToken, InMemoryRateLimiter } from '../auth.js';
import { withTransaction } from '../db.js';
import { getUserStatusCache } from '../user-status.js';

export function registerDataRoutes(app, options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const userStatusCache =
    options.userStatusCache || app.userStatusCache || getUserStatusCache();

  const dataRateLimitMax =
    options.dataRateLimitMax ||
    parseInt(process.env.DATA_RATE_LIMIT_MAX || '300', 10);
  const dataRateLimitWindowMs =
    options.dataRateLimitWindowMs ||
    parseInt(process.env.DATA_RATE_LIMIT_WINDOW_MS || '60000', 10);

  const dataRateLimiter =
    options.dataRateLimiter ||
    new InMemoryRateLimiter({
      max: dataRateLimitMax,
      windowMs: dataRateLimitWindowMs,
    });

  async function getAuthenticatedUser(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing or invalid authorization header' });
      return null;
    }

    const token = authHeader.slice(7).trim();
    let payload;
    try {
      payload = await verifyAccessToken(token, jwtSecret);
    } catch (err) {
      reply.status(401).send({ error: 'Invalid or expired token' });
      return null;
    }

    const userId = payload.sub;
    if (!userId) {
      reply.status(401).send({ error: 'Invalid or expired token' });
      return null;
    }

    // BAN1: Check user status after token verification, before rate limiter and DB work
    try {
      const status = await userStatusCache.get(userId);
      if (status !== 'active') {
        reply.status(403).send({ error: 'Account unavailable' });
        return null;
      }
    } catch (statusErr) {
      request.log.error({ err: statusErr }, 'User status check error');
      reply.status(503).send({ error: 'Service temporarily unavailable' });
      return null;
    }

    const check = dataRateLimiter.check(userId);
    if (!check.allowed) {
      reply.header('Retry-After', Math.ceil(check.retryAfterMs / 1000));
      reply.status(429).send({ error: 'Too many requests, please try again later' });
      return null;
    }

    return payload;
  }

  // GET /courts
  app.get('/courts', async (request, reply) => {
    const payload = await getAuthenticatedUser(request, reply);
    if (!payload) return;

    try {
      const courts = await withTransaction(
        async (client) => {
          const res = await client.query(
            'SELECT * FROM public.courts ORDER BY name ASC;'
          );
          return res.rows;
        },
        {
          uid: payload.sub,
          claims: { sub: payload.sub, email: payload.email, role: 'authenticated' },
          role: 'authenticated',
        }
      );

      return reply.status(200).send(courts);
    } catch (err) {
      if (err.code === '57014') {
        return reply.status(503).send({ error: 'Service temporarily unavailable' });
      }
      request.log.error({ err }, 'Error querying courts');
      return reply.status(500).send({ error: 'Failed to retrieve courts' });
    }
  });

  // GET /messages?sessionId=... or GET /messages/:sessionId
  const handleGetMessages = async (request, reply) => {
    const payload = await getAuthenticatedUser(request, reply);
    if (!payload) return;

    const sessionId = request.params.sessionId || request.query.sessionId || request.query.session_id;
    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId query or path param is required' });
    }

    const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 50, 1), 200);

    try {
      const messages = await withTransaction(
        async (client) => {
          // RLS policy on public.messages requires hoopup_private.is_member(session_id)
          const res = await client.query(
            `SELECT id, session_id, sender_id, client_message_id, body, created_at
             FROM public.messages
             WHERE session_id = $1::uuid
             ORDER BY created_at ASC, id ASC
             LIMIT $2;`,
            [sessionId, limit]
          );
          return res.rows;
        },
        {
          uid: payload.sub,
          claims: { sub: payload.sub, email: payload.email, role: 'authenticated' },
          role: 'authenticated',
        }
      );

      return reply.status(200).send(messages);
    } catch (err) {
      if (err.code === '57014') {
        return reply.status(503).send({ error: 'Service temporarily unavailable' });
      }
      request.log.warn({ errCode: err.code, errMsg: err.message }, 'Error querying messages');
      if (err.code === '22P02') {
        return reply.status(400).send({ error: 'Invalid UUID format for sessionId' });
      }
      return reply.status(500).send({ error: 'Failed to retrieve messages' });
    }
  };

  app.get('/messages', handleGetMessages);
  app.get('/messages/:sessionId', handleGetMessages);

  // GET /session_members/:sessionId or GET /session_members?sessionId=...
  const handleGetMembers = async (request, reply) => {
    const payload = await getAuthenticatedUser(request, reply);
    if (!payload) return;

    const sessionId = request.params.sessionId || request.query.sessionId || request.query.session_id;
    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId is required' });
    }

    try {
      const members = await withTransaction(
        async (client) => {
          const res = await client.query(
            `SELECT session_id, user_id, status, position, requested_at, confirmed_at, decided_by, updated_at
             FROM public.session_members
             WHERE session_id = $1::uuid
             ORDER BY requested_at ASC;`,
            [sessionId]
          );
          return res.rows;
        },
        {
          uid: payload.sub,
          claims: { sub: payload.sub, email: payload.email, role: 'authenticated' },
          role: 'authenticated',
        }
      );

      return reply.status(200).send(members);
    } catch (err) {
      if (err.code === '57014') {
        return reply.status(503).send({ error: 'Service temporarily unavailable' });
      }
      request.log.warn({ errCode: err.code, errMsg: err.message }, 'Error querying members');
      if (err.code === '22P02') {
        return reply.status(400).send({ error: 'Invalid UUID format for sessionId' });
      }
      return reply.status(500).send({ error: 'Failed to retrieve members' });
    }
  };

  app.get('/session_members', handleGetMembers);
  app.get('/session_members/:sessionId', handleGetMembers);

  // GET /profiles/:userId
  app.get('/profiles/:userId', async (request, reply) => {
    const payload = await getAuthenticatedUser(request, reply);
    if (!payload) return;

    const targetUserId = request.params.userId;
    try {
      const profile = await withTransaction(
        async (client) => {
          const res = await client.query(
            `SELECT id, display_name, avatar_path, skill_level, primary_position, secondary_position, plays_any_position,
                    CASE WHEN id = $1::uuid OR height_visible THEN height_cm ELSE null END AS height_cm,
                    CASE WHEN id = $1::uuid THEN height_visible ELSE null END AS height_visible,
                    created_at, updated_at
             FROM public.profiles
             WHERE id = $2::uuid;`,
            [payload.sub, targetUserId]
          );
          return res.rows[0] || null;
        },
        {
          uid: payload.sub,
          claims: { sub: payload.sub, email: payload.email, role: 'authenticated' },
          role: 'authenticated',
        }
      );

      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }

      return reply.status(200).send(profile);
    } catch (err) {
      if (err.code === '57014') {
        return reply.status(503).send({ error: 'Service temporarily unavailable' });
      }
      if (err.code === '22P02') {
        return reply.status(400).send({ error: 'Invalid UUID format for userId' });
      }
      return reply.status(500).send({ error: 'Failed to retrieve profile' });
    }
  });

  // Store references for testing
  app.dataRateLimiter = dataRateLimiter;
}
