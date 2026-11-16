import http from 'node:http';
import crypto from 'node:crypto';
import * as jose from 'jose';

export class FakeIdP {
  constructor(options = {}) {
    this.clientId = options.clientId || 'test-client-id';
    this.clientSecret = options.clientSecret || 'test-client-secret';
    this.redirectUri = options.redirectUri || 'http://127.0.0.1:3000/auth/oidc/google/callback';
    this.server = null;
    this.port = null;
    this.issuer = null;

    this.codes = new Map();
    this.tokenHook = null;
    this.jwksHook = null;

    this.rsKeyPair = null;
    this.esKeyPair = null;
    this.rsJwk = null;
    this.esJwk = null;
    this.activeAlg = 'RS256';
  }

  async init() {
    this.rsKeyPair = await jose.generateKeyPair('RS256', { extractable: true });
    this.esKeyPair = await jose.generateKeyPair('ES256', { extractable: true });

    const rawRsJwk = await jose.exportJWK(this.rsKeyPair.publicKey);
    this.rsJwk = {
      ...rawRsJwk,
      kid: 'rs-key-1',
      alg: 'RS256',
      use: 'sig',
    };

    const rawEsJwk = await jose.exportJWK(this.esKeyPair.publicKey);
    this.esJwk = {
      ...rawEsJwk,
      kid: 'es-key-1',
      alg: 'ES256',
      use: 'sig',
    };
  }

  async start() {
    if (!this.rsKeyPair) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, `http://127.0.0.1:${this.port || 0}`);

          if (url.pathname === '/jwks' && req.method === 'GET') {
            if (this.jwksHook) {
              return await this.jwksHook(req, res);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                keys: [this.rsJwk, this.esJwk],
              })
            );
          }

          if (url.pathname === '/token' && req.method === 'POST') {
            const chunks = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString('utf8');
            const params = new URLSearchParams(bodyStr);

            if (this.tokenHook) {
              return await this.tokenHook(req, res, params);
            }

            const clientId = params.get('client_id');
            const clientSecret = params.get('client_secret');
            const redirectUri = params.get('redirect_uri');
            const code = params.get('code');
            const codeVerifier = params.get('code_verifier');

            if (
              clientId !== this.clientId ||
              clientSecret !== this.clientSecret ||
              redirectUri !== this.redirectUri
            ) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'invalid_client_or_redirect' }));
            }

            if (!code || !this.codes.has(code)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'invalid_grant' }));
            }

            const codeEntry = this.codes.get(code);
            this.codes.delete(code); // One-time use

            // PKCE verification
            const computedChallenge = crypto
              .createHash('sha256')
              .update(codeVerifier || '')
              .digest('base64url');

            if (computedChallenge !== codeEntry.codeChallenge) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE failed' }));
            }

            let idToken = codeEntry.customIdToken;
            if (!idToken) {
              const alg = codeEntry.alg || this.activeAlg || 'RS256';
              const keyPair = alg === 'ES256' ? this.esKeyPair : this.rsKeyPair;
              const kid = alg === 'ES256' ? 'es-key-1' : 'rs-key-1';

              const claims = codeEntry.claims || {};
              const nowSec = Math.floor(Date.now() / 1000);

              const jwtBuilder = new jose.SignJWT({
                sub: claims.sub || 'test-user-sub',
                email: claims.email,
                email_verified: claims.email_verified,
                name: claims.name,
                picture: claims.picture,
                nonce: claims.nonce,
                ...claims,
              })
                .setProtectedHeader({ alg, kid })
                .setIssuer(this.issuer)
                .setAudience(claims.aud || this.clientId)
                .setIssuedAt(claims.iat !== undefined ? claims.iat : nowSec)
                .setExpirationTime(claims.exp !== undefined ? claims.exp : nowSec + 3600);

              idToken = await jwtBuilder.sign(keyPair.privateKey);
            }

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            });
            return res.end(
              JSON.stringify({
                access_token: 'fake_upstream_access_token',
                token_type: 'Bearer',
                expires_in: 3600,
                id_token: idToken,
              })
            );
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not_found' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'server_error', message: err.message }));
        }
      });

      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        this.issuer = `http://127.0.0.1:${this.port}`;
        resolve(this);
      });

      this.server.on('error', reject);
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }

  registerCode(code, { codeChallenge, claims, customIdToken, alg }) {
    this.codes.set(code, {
      codeChallenge,
      claims,
      customIdToken,
      alg,
    });
  }

  async createSignedIdToken(claims, options = {}) {
    const alg = options.alg || 'RS256';
    const kid = options.kid !== undefined ? options.kid : (alg === 'ES256' ? 'es-key-1' : 'rs-key-1');
    const keyPair = options.keyPair || (alg === 'ES256' ? this.esKeyPair : this.rsKeyPair);
    const nowSec = Math.floor(Date.now() / 1000);

    const builder = new jose.SignJWT({
      sub: claims.sub || 'test-user-sub',
      ...claims,
    })
      .setProtectedHeader({ alg, kid })
      .setIssuer(options.issuer || this.issuer)
      .setAudience(options.audience !== undefined ? options.audience : this.clientId)
      .setIssuedAt(claims.iat !== undefined ? claims.iat : nowSec)
      .setExpirationTime(claims.exp !== undefined ? claims.exp : nowSec + 3600);

    return builder.sign(keyPair.privateKey);
  }
}
