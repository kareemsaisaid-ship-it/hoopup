import crypto from 'node:crypto';
import { withClient, withTransaction } from '../db.js';
import { createAccessToken, validateDisplayName } from '../auth.js';
import { getUserStatusCache } from '../user-status.js';
import {
  loadOidcConfig,
  OidcStateStore,
  OidcExchangeCodeStore,
  generateOidcSession,
  verifyIdToken,
  safeEqual,
} from '../oidc.js';

function getCookie(cookieHeader, name) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function appendUrlParam(baseUrlStr, key, val) {
  const u = new URL(baseUrlStr);
  u.searchParams.set(key, val);
  return u.toString();
}

export function registerOidcRoutes(app, options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const userStatusCache =
    options.userStatusCache || app.userStatusCache || getUserStatusCache();

  const oidcConfig = options.oidcConfig || loadOidcConfig({
    ...options,
    logger: app.log,
  });

  const stateStore = options.oidcStateStore || new OidcStateStore();
  const exchangeCodeStore = options.oidcExchangeCodeStore || new OidcExchangeCodeStore();

  app.oidcConfig = oidcConfig;
  app.oidcStateStore = stateStore;
  app.oidcExchangeCodeStore = exchangeCodeStore;

  // 1. GET /auth/oidc/:provider/start?return_to=<url>
  app.get('/auth/oidc/:provider/start', async (request, reply) => {
    const providerName = (request.params.provider || '').toLowerCase();
    const provider = oidcConfig.providers.get(providerName);

    if (!provider) {
      return reply.status(404).send({ error: 'provider_not_configured' });
    }

    const returnTo = request.query.return_to;
    if (
      !returnTo ||
      typeof returnTo !== 'string' ||
      !oidcConfig.allowedReturnUrls.has(returnTo)
    ) {
      return reply.status(400).send({ error: 'invalid_return_to' });
    }

    const session = generateOidcSession();
    stateStore.save({
      state: session.state,
      provider: providerName,
      nonce: session.nonce,
      verifier: session.verifier,
      returnTo,
      cookieHash: session.cookieHash,
    });

    const isProd = process.env.NODE_ENV === 'production';
    reply.header(
      'Set-Cookie',
      `hoopup_oidc=${session.cookieValue}; HttpOnly; SameSite=Lax; Path=/auth/oidc; Max-Age=600${isProd ? '; Secure' : ''}`
    );

    const authUrl = new URL(provider.authUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', provider.clientId);
    authUrl.searchParams.set('redirect_uri', provider.redirectUri);
    authUrl.searchParams.set('scope', provider.scope);
    authUrl.searchParams.set('state', session.state);
    authUrl.searchParams.set('nonce', session.nonce);
    authUrl.searchParams.set('code_challenge', session.challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return reply.redirect(authUrl.toString(), 302);
  });

  // 2. GET /auth/oidc/:provider/callback?code&state
  app.get('/auth/oidc/:provider/callback', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');

    const providerParam = (request.params.provider || '').toLowerCase();
    const provider = oidcConfig.providers.get(providerParam);

    const { code, state, error: providerError } = request.query || {};

    // Validate parameter shape
    if (
      Array.isArray(state) ||
      Array.isArray(code) ||
      Array.isArray(providerError) ||
      (typeof state === 'string' && state.length > 2048) ||
      (typeof code === 'string' && code.length > 2048) ||
      (typeof providerError === 'string' && providerError.length > 2048)
    ) {
      return reply.status(400).send({ error: 'invalid_request' });
    }

    if (!state || typeof state !== 'string') {
      return reply.status(400).send({ error: 'invalid_request' });
    }

    // Look up and DELETE the state entry first (so replay fails)
    const stateEntry = stateStore.consume(state);
    if (!stateEntry) {
      return reply.status(400).send({ error: 'invalid_request' });
    }

    // Require cookie to match
    const cookieVal = getCookie(request.headers.cookie, 'hoopup_oidc');
    const cookieHash = cookieVal
      ? crypto.createHash('sha256').update(cookieVal).digest('hex')
      : '';

    if (!cookieVal || !safeEqual(cookieHash, stateEntry.cookieHash)) {
      return reply.status(400).send({ error: 'invalid_request' });
    }

    // Check provider matches the one in the state
    if (stateEntry.provider !== providerParam || !provider) {
      return reply.status(400).send({ error: 'invalid_request' });
    }

    // Check provider error or missing code
    if (providerError) {
      return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', providerError), 302);
    }

    if (!code || typeof code !== 'string') {
      return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'invalid_request'), 302);
    }

    // Exchange code at token endpoint
    let tokenData;
    try {
      const formParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: provider.redirectUri,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code_verifier: stateEntry.verifier,
      });

      const res = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formParams.toString(),
        signal: AbortSignal.timeout(provider.tokenTimeoutMs || 5000),
        redirect: 'error',
      });

      if (!res.ok) {
        return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'token_endpoint_error'), 302);
      }

      // Read capped body (~64 kB)
      const text = await res.text();
      if (text.length > 65536) {
        return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'invalid_token_response'), 302);
      }
      tokenData = JSON.parse(text);
    } catch (_err) {
      return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'token_endpoint_error'), 302);
    }

    if (!tokenData || typeof tokenData.id_token !== 'string') {
      return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'invalid_token_response'), 302);
    }

    // Verify ID Token with jose
    let claims;
    try {
      claims = await verifyIdToken(tokenData.id_token, provider, stateEntry.nonce);
    } catch (_err) {
      return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'invalid_token'), 302);
    }

    // Resolve user in single database transaction
    let resolvedUserId;
    try {
      await withTransaction(async (client) => {
        // 1. Check existing identity
        const identRes = await client.query(
          `SELECT user_id FROM app_auth.identities WHERE provider = $1 AND subject = $2;`,
          [provider.name, claims.sub]
        );

        if (identRes.rows.length > 0) {
          resolvedUserId = identRes.rows[0].user_id;
          await client.query(
            `UPDATE app_auth.identities SET last_login_at = now() WHERE provider = $1 AND subject = $2;`,
            [provider.name, claims.sub]
          );
          return;
        }

        // 2. Identity not found: check verified email
        const isVerifiedClaim = claims.email_verified === true || claims.email_verified === 'true';
        const hasVerifiedEmail =
          Boolean(claims.email && typeof claims.email === 'string') &&
          (isVerifiedClaim || provider.trustEmail);

        if (hasVerifiedEmail) {
          const userLookup = await client.query(
            `SELECT id, password_hash, email_verified FROM app_auth.users WHERE email = $1;`,
            [claims.email]
          );

          if (userLookup.rows.length > 0) {
            // Existing user found -> LINK identity
            const existingUser = userLookup.rows[0];
            resolvedUserId = existingUser.id;

            // PRE-HIJACK RULE: if email_verified is false, clear password_hash and mark verified
            if (existingUser.password_hash !== null && !existingUser.email_verified) {
              await client.query(
                `UPDATE app_auth.users SET password_hash = NULL, email_verified = true WHERE id = $1;`,
                [existingUser.id]
              );
            } else if (!existingUser.email_verified) {
              await client.query(
                `UPDATE app_auth.users SET email_verified = true WHERE id = $1;`,
                [existingUser.id]
              );
            }

            await client.query('SAVEPOINT link_ident');
            try {
              await client.query(
                `INSERT INTO app_auth.identities (user_id, provider, subject, email, last_login_at)
                 VALUES ($1, $2, $3, $4, now());`,
                [existingUser.id, provider.name, claims.sub, claims.email]
              );
              await client.query('RELEASE SAVEPOINT link_ident');
            } catch (err) {
              if (err.code === '23505') {
                await client.query('ROLLBACK TO SAVEPOINT link_ident');
              } else {
                throw err;
              }
            }
            return;
          }

          // User not found -> CREATE user + identity + profile
          let createdNewUser = false;
          await client.query('SAVEPOINT create_user_sp');
          try {
            const newUserRes = await client.query(
              `INSERT INTO app_auth.users (email, password_hash, email_verified)
               VALUES ($1, NULL, true)
               RETURNING id;`,
              [claims.email]
            );
            resolvedUserId = newUserRes.rows[0].id;
            await client.query(
              `INSERT INTO app_auth.identities (user_id, provider, subject, email, last_login_at)
               VALUES ($1, $2, $3, $4, now());`,
              [resolvedUserId, provider.name, claims.sub, claims.email]
            );
            createdNewUser = true;
            await client.query('RELEASE SAVEPOINT create_user_sp');
          } catch (err) {
            if (err.code === '23505') {
              await client.query('ROLLBACK TO SAVEPOINT create_user_sp');
              // Parallel insertion race: re-select identity or user
              const reIdent = await client.query(
                `SELECT user_id FROM app_auth.identities WHERE provider = $1 AND subject = $2;`,
                [provider.name, claims.sub]
              );
              if (reIdent.rows.length > 0) {
                resolvedUserId = reIdent.rows[0].user_id;
                await client.query(
                  `UPDATE app_auth.identities SET last_login_at = now() WHERE provider = $1 AND subject = $2;`,
                  [provider.name, claims.sub]
                );
                return;
              }
              const reUser = await client.query(
                `SELECT id FROM app_auth.users WHERE email = $1;`,
                [claims.email]
              );
              if (reUser.rows.length > 0) {
                resolvedUserId = reUser.rows[0].id;
                await client.query(
                  `INSERT INTO app_auth.identities (user_id, provider, subject, email, last_login_at)
                   VALUES ($1, $2, $3, $4, now())
                   ON CONFLICT (provider, subject) DO UPDATE SET last_login_at = now();`,
                  [resolvedUserId, provider.name, claims.sub, claims.email]
                );
                return;
              }
              throw err;
            } else {
              throw err;
            }
          }

          if (createdNewUser) {
            let candidateName = typeof claims.name === 'string' ? claims.name.slice(0, 60) : null;
            const nameCheck = validateDisplayName(candidateName);
            let displayName = (nameCheck.valid && nameCheck.displayName) ? nameCheck.displayName : null;
            if (!displayName) {
              displayName = `ผู้เล่น${crypto.randomBytes(2).toString('hex')}`;
            }
            await client.query(
              "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true);",
              [resolvedUserId, JSON.stringify({ sub: resolvedUserId, role: 'authenticated' })]
            );
            await client.query(
              'SELECT public.hoopup_save_profile($1::jsonb);',
              [JSON.stringify({ displayName })]
            );
          }
          return;
        }

        // 3. No verified email
        if (!provider.allowUnverifiedEmail) {
          const err = new Error('email_not_verified');
          err.code = 'EMAIL_NOT_VERIFIED';
          throw err;
        }

        // Provider allows unverified email (e.g. LINE preset): create placeholder account
        const subHash = crypto.createHash('sha256').update(claims.sub).digest('hex').slice(0, 16);
        const placeholderEmail = `${provider.name}-${subHash}@oidc.invalid`;

        let createdPlaceholder = false;
        await client.query('SAVEPOINT create_line_sp');
        try {
          const newPlaceholderRes = await client.query(
            `INSERT INTO app_auth.users (email, password_hash, email_verified)
             VALUES ($1, NULL, false)
             RETURNING id;`,
            [placeholderEmail]
          );
          resolvedUserId = newPlaceholderRes.rows[0].id;
          await client.query(
            `INSERT INTO app_auth.identities (user_id, provider, subject, email, last_login_at)
             VALUES ($1, $2, $3, $4, now());`,
            [resolvedUserId, provider.name, claims.sub, claims.email || null]
          );
          createdPlaceholder = true;
          await client.query('RELEASE SAVEPOINT create_line_sp');
        } catch (err) {
          if (err.code === '23505') {
            await client.query('ROLLBACK TO SAVEPOINT create_line_sp');
            const reIdent = await client.query(
              `SELECT user_id FROM app_auth.identities WHERE provider = $1 AND subject = $2;`,
              [provider.name, claims.sub]
            );
            if (reIdent.rows.length > 0) {
              resolvedUserId = reIdent.rows[0].user_id;
              await client.query(
                `UPDATE app_auth.identities SET last_login_at = now() WHERE provider = $1 AND subject = $2;`,
                [provider.name, claims.sub]
              );
              return;
            }
            throw err;
          } else {
            throw err;
          }
        }

        if (createdPlaceholder) {
          let candidateName = typeof claims.name === 'string' ? claims.name.slice(0, 60) : null;
          const nameCheck = validateDisplayName(candidateName);
          let displayName = (nameCheck.valid && nameCheck.displayName) ? nameCheck.displayName : null;
          if (!displayName) {
            displayName = `ผู้เล่น${crypto.randomBytes(2).toString('hex')}`;
          }
          await client.query(
            "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true);",
            [resolvedUserId, JSON.stringify({ sub: resolvedUserId, role: 'authenticated' })]
          );
          await client.query(
            'SELECT public.hoopup_save_profile($1::jsonb);',
            [JSON.stringify({ displayName })]
          );
        }
      });
    } catch (dbErr) {
      if (dbErr.code === 'EMAIL_NOT_VERIFIED') {
        return reply.status(403).send({ error: 'email_not_verified' });
      }
      request.log.error({ err: dbErr }, 'Error resolving OIDC user in database');
      return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'account_unavailable'), 302);
    }

    // Status check with BAN1's helper AFTER the user is resolved and BEFORE any code is issued
    try {
      userStatusCache.invalidate(resolvedUserId);
      const status = await userStatusCache.get(resolvedUserId);
      if (status !== 'active') {
        return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'account_unavailable'), 302);
      }
    } catch (statusErr) {
      request.log.error({ err: statusErr }, 'User status check error during OIDC callback');
      return reply.redirect(appendUrlParam(stateEntry.returnTo, 'error', 'account_unavailable'), 302);
    }

    // Issue ONE-TIME exchange code
    const exchangeCode = exchangeCodeStore.issue(resolvedUserId);
    return reply.redirect(appendUrlParam(stateEntry.returnTo, 'code', exchangeCode), 302);
  });

  // 3. POST /auth/oidc/exchange
  app.post('/auth/oidc/exchange', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');

    const { code } = request.body || {};
    if (!code || typeof code !== 'string' || code.length > 2048) {
      return reply.status(400).send({ error: 'invalid_code' });
    }

    const entry = exchangeCodeStore.consume(code);
    if (!entry) {
      return reply.status(400).send({ error: 'invalid_code' });
    }

    // Re-check user status
    try {
      userStatusCache.invalidate(entry.userId);
      const status = await userStatusCache.get(entry.userId);
      if (status !== 'active') {
        return reply.status(403).send({ error: 'Account unavailable' });
      }
    } catch (statusErr) {
      request.log.error({ err: statusErr }, 'User status check error during OIDC exchange');
      return reply.status(503).send({ error: 'Service temporarily unavailable' });
    }

    let user;
    try {
      user = await withClient(async (client) => {
        const res = await client.query(
          `SELECT id, email, created_at, email_verified
           FROM app_auth.users
           WHERE id = $1;`,
          [entry.userId]
        );
        return res.rows[0];
      });
    } catch (err) {
      request.log.error({ err }, 'Error looking up user during exchange');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

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
}
