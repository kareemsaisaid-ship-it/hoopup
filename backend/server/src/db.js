import pg from 'pg';

const { Pool } = pg;

let poolInstance = null;

export function initPool(config = {}) {
  if (poolInstance) {
    return poolInstance;
  }

  const connectionString = config.databaseUrl || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment or config');
  }

  const statementTimeout =
    config.statementTimeout !== undefined
      ? config.statementTimeout
      : parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '10000', 10);

  const idleInTxTimeout =
    config.idleInTransactionSessionTimeout !== undefined
      ? config.idleInTransactionSessionTimeout
      : parseInt(process.env.DB_IDLE_TX_TIMEOUT_MS || '15000', 10);

  poolInstance = new Pool({
    connectionString,
    max: config.max || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: statementTimeout,
    idle_in_transaction_session_timeout: idleInTxTimeout,
  });

  return poolInstance;
}

export function getPool() {
  if (!poolInstance) {
    return initPool();
  }
  return poolInstance;
}

export async function closePool() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export async function withClient(callback) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

const ALLOWED_ROLES = new Set(['authenticated', 'anon', 'hoopup_api']);

export async function withTransaction(callback, options = {}) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const { uid, claims, role } = options;

      if (uid !== undefined || claims !== undefined) {
        const subVal = uid != null ? String(uid) : '';
        const claimsVal = claims ? JSON.stringify(claims) : '{}';
        await client.query(
          "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
          [subVal, claimsVal]
        );
      }

      if (role) {
        if (!ALLOWED_ROLES.has(role)) {
          throw new Error(`Unauthorized database role requested: ${role}`);
        }
        await client.query(`SET LOCAL ROLE ${role}`);
      }

      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore rollback errors if connection was lost
      }
      throw err;
    }
  });
}
