import { withClient } from './db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function defaultQueryUserStatus(userId) {
  if (!UUID_REGEX.test(userId)) {
    return 'missing';
  }
  return withClient(async (client) => {
    const res = await client.query(
      'SELECT id, banned_at, deleted_at FROM app_auth.users WHERE id = $1;',
      [userId]
    );
    if (res.rows.length === 0) {
      return 'missing';
    }
    const row = res.rows[0];
    if (row.deleted_at) {
      return 'deleted';
    }
    if (row.banned_at) {
      return 'banned';
    }
    return 'active';
  });
}

export class UserStatusCache {
  constructor(options = {}) {
    if (options.ttlMs !== undefined) {
      this.ttlMs = options.ttlMs;
    } else if (process.env.USER_STATUS_CACHE_MS !== undefined) {
      const parsed = parseInt(process.env.USER_STATUS_CACHE_MS, 10);
      this.ttlMs = Number.isNaN(parsed) ? 30000 : parsed;
    } else {
      this.ttlMs = 30000;
    }

    this.maxSize = options.maxSize || 10000;
    this.queryFn = options.queryFn || defaultQueryUserStatus;
    this.cache = new Map();
    this.pendingQueries = new Map();
    this.generations = new Map();
  }

  async get(userId) {
    if (!userId || typeof userId !== 'string') {
      return 'missing';
    }

    const now = Date.now();

    if (this.ttlMs > 0) {
      const cached = this.cache.get(userId);
      if (cached) {
        if (cached.expiresAt > now) {
          return cached.status;
        }
        this.cache.delete(userId);
      }
    }

    if (this.pendingQueries.has(userId)) {
      return this.pendingQueries.get(userId);
    }

    const currentGen = this.generations.get(userId) || 0;
    const promise = (async () => {
      try {
        const status = await this.queryFn(userId);
        if (this.ttlMs > 0 && (this.generations.get(userId) || 0) === currentGen) {
          if (this.cache.has(userId)) {
            this.cache.delete(userId);
          } else if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
          }
          this.cache.set(userId, {
            status,
            expiresAt: Date.now() + this.ttlMs,
          });
        }
        return status;
      } finally {
        if (this.pendingQueries.get(userId) === promise) {
          this.pendingQueries.delete(userId);
        }
      }
    })();

    this.pendingQueries.set(userId, promise);
    return promise;
  }

  invalidate(userId) {
    if (userId) {
      this.cache.delete(userId);
      this.pendingQueries.delete(userId);
      if (this.generations.size >= this.maxSize) {
        const oldestKey = this.generations.keys().next().value;
        this.generations.delete(oldestKey);
      }
      this.generations.set(userId, (this.generations.get(userId) || 0) + 1);
    }
  }

  clear() {
    this.cache.clear();
    this.pendingQueries.clear();
    this.generations.clear();
  }
}

let defaultCacheInstance = null;
export function getUserStatusCache(options = {}) {
  if (!defaultCacheInstance || options.forceNew) {
    defaultCacheInstance = new UserStatusCache(options);
  }
  return defaultCacheInstance;
}
