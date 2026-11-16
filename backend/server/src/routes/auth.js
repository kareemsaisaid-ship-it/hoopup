import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  hashPassword,
  verifyPassword,
  createAccessToken,
  verifyAccessToken,
  DUMMY_PASSWORD_HASH,
  LoginAccountLock,
} from '../auth.js';
import { withClient, withTransaction } from '../db.js';
import { getUserStatusCache } from '../user-status.js';

export function registerAuthRoutes(app, options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const userStatusCache =
    options.userStatusCache || app.userStatusCache || getUserStatusCache();
  const loginLock = options.loginLock || new LoginAccountLock({
    max: options.loginLockMax,
    windowMs: options.loginLockWindowMs,
    lockSeconds: options.loginLockSeconds,
  });
  app.loginLock = loginLock;

  // POST /auth/signup
  app.post('/auth/signup', async (request, reply) => {
    const { email, password, displayName } = request.body || {};

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return reply.status(400).send({ error: emailValidation.error });
    }

    const pwValidation = validatePassword(password, {
      email: emailValidation.email,
      displayName,
    });
    if (!pwValidation.valid) {
      return reply.status(400).send({ error: pwValidation.error });
    }

    const nameValidation = validateDisplayName(displayName);
    if (!nameValidation.valid) {
      return reply.status(400).send({ error: nameValidation.error });
    }

    const hashedPassword = await hashPassword(password);
    const normalizedEmail = emailValidation.email;

    let newUser;
    try {
      newUser = await withClient(async (client) => {
        const res = await client.query(
          `INSERT INTO app_auth.users (email, password_hash)
           VALUES ($1, $2)
           RETURNING id, email, created_at, email_verified;`,
          [normalizedEmail, hashedPassword]
        );
        return res.rows[0];
      });
    } catch (err) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Email already registered' });
      }
      request.log.error({ err }, 'Error during signup');
      return reply.status(500).send({ error: 'Failed to create user' });
    }

    // If displayName provided, initialize public profile
    if (nameValidation.displayName) {
      try {
        await withTransaction(
          async (client) => {
            await client.query(
              'SELECT public.hoopup_save_profile($1::jsonb);',
              [JSON.stringify({ displayName: nameValidation.displayName })]
            );
          },
          {
            uid: newUser.id,
            claims: { sub: newUser.id, email: newUser.email, role: 'authenticated' },
            role: 'authenticated',
          }
        );
      } catch (profileErr) {
        request.log.warn({ profileErr }, 'Could not automatically save initial profile');
      }
    }

    const accessToken = await createAccessToken(newUser, jwtSecret);

    return reply.status(201).send({
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: newUser.id,
        email: newUser.email,
        createdAt: newUser.created_at,
        emailVerified: Boolean(newUser.email_verified),
      },
    });
  });

  // POST /auth/login
  app.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check per-account login lock before DB lookup
    const lockStatus = loginLock.isLocked(normalizedEmail);
    if (lockStatus.locked) {
      reply.header('Retry-After', lockStatus.retryAfter);
      return reply.status(429).send({
        error: 'Too many failed login attempts. Please try again later.',
        retryAfter: lockStatus.retryAfter,
      });
    }

    let user;
    try {
      user = await withClient(async (client) => {
        const res = await client.query(
          `SELECT id, email, password_hash, created_at, banned_at, deleted_at, email_verified
           FROM app_auth.users
           WHERE email = $1;`,
          [normalizedEmail]
        );
        return res.rows[0];
      });
    } catch (err) {
      request.log.error({ err }, 'Error during login lookup');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    // B2: Generic error + timing mitigation: run bcrypt against fixed dummy hash if user not found
    if (!user) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      loginLock.recordFailure(normalizedEmail);
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // OIDC-only user (password_hash IS NULL): run bcrypt against dummy hash and return 401
    if (!user.password_hash) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      loginLock.recordFailure(normalizedEmail);
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      loginLock.recordFailure(normalizedEmail);
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // BAN1: Correct password, check if account is banned or deleted
    if (user.deleted_at || user.banned_at) {
      return reply.status(403).send({ error: 'Account unavailable' });
    }

    // Clear failure record on successful login
    loginLock.recordSuccess(normalizedEmail);

    const accessToken = await createAccessToken(user, jwtSecret);

    return reply.status(200).send({
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        emailVerified: Boolean(user.email_verified),
      },
    });
  });

  // GET /auth/me
  app.get('/auth/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7).trim();
    let payload;
    try {
      payload = await verifyAccessToken(token, jwtSecret);
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const userId = payload.sub;
    if (!userId) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    // BAN1: Check user status after token verification, before DB work
    try {
      const status = await userStatusCache.get(userId);
      if (status !== 'active') {
        return reply.status(403).send({ error: 'Account unavailable' });
      }
    } catch (statusErr) {
      request.log.error({ err: statusErr }, 'User status check error');
      return reply.status(503).send({ error: 'Service temporarily unavailable' });
    }
    let user;
    let profile = null;
    try {
      user = await withClient(async (client) => {
        const res = await client.query(
          `SELECT id, email, created_at, email_verified
           FROM app_auth.users
           WHERE id = $1;`,
          [userId]
        );
        return res.rows[0];
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Read profile under authenticated role
      profile = await withTransaction(
        async (client) => {
          const res = await client.query(
            `SELECT id, display_name, avatar_path, skill_level, primary_position, secondary_position, plays_any_position, height_cm, height_visible, created_at, updated_at
             FROM public.profiles
             WHERE id = $1;`,
            [userId]
          );
          return res.rows[0] || null;
        },
        {
          uid: userId,
          claims: { sub: userId, email: user.email, role: 'authenticated' },
          role: 'authenticated',
        }
      );
    } catch (err) {
      request.log.error({ err }, 'Error during /auth/me');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        emailVerified: Boolean(user.email_verified),
      },
      profile,
    });
  });

  // POST /auth/logout
  app.post('/auth/logout', async (_request, reply) => {
    // Client-side token drop is fine for stateless JWT architecture
    return reply.status(200).send({ ok: true, message: 'Logged out' });
  });
}
