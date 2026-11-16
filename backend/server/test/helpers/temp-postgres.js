import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '../..');
const BACKEND_DIR = path.resolve(SERVER_DIR, '..');

const DEFAULT_PG_BIN = 'C:\\D_Drive\\terminter01\\dsl-auto-master\\tools\\pgsql\\bin';

export async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

export async function startTempPostgres(options = {}) {
  const pgBin = options.pgBin || process.env.PG_BIN || DEFAULT_PG_BIN;
  const ext = process.platform === 'win32' ? '.exe' : '';
  const bins = {
    initdb: path.join(pgBin, `initdb${ext}`),
    pg_ctl: path.join(pgBin, `pg_ctl${ext}`),
    psql: path.join(pgBin, `psql${ext}`),
  };

  for (const [name, binPath] of Object.entries(bins)) {
    if (!fs.existsSync(binPath)) {
      throw new Error(`Required postgres binary '${name}' not found at: ${binPath}`);
    }
  }

  const runId = crypto.randomBytes(6).toString('hex');
  const baseRunDir = path.join(BACKEND_DIR, '.local-test');
  fs.mkdirSync(baseRunDir, { recursive: true });
  const runDir = path.join(baseRunDir, `node-run-${runId}`);
  fs.mkdirSync(runDir, { recursive: true });
  const dataDir = path.join(runDir, 'data');
  const logFile = path.join(runDir, 'postgres.log');

  const port = await findFreePort();
  const env = { ...process.env, PGCLIENTENCODING: 'UTF8' };

  // 1. initdb
  const initResult = spawnSync(
    bins.initdb,
    ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale'],
    { env, encoding: 'utf8' }
  );
  if (initResult.status !== 0) {
    throw new Error(`initdb failed (code ${initResult.status}):\n${initResult.stderr || initResult.stdout}`);
  }

  // 2. pg_ctl start
  const startLogFd = fs.openSync(path.join(runDir, 'pg_ctl_start.log'), 'w');
  const startResult = spawnSync(
    bins.pg_ctl,
    [
      '-D',
      dataDir,
      '-l',
      logFile,
      '-o',
      `-h 127.0.0.1 -p ${port} -c fsync=off`,
      '-w',
      'start',
    ],
    {
      env,
      stdio: ['ignore', startLogFd, startLogFd],
      timeout: 30000,
    }
  );
  fs.closeSync(startLogFd);

  if (startResult.status !== 0) {
    const startLog = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    throw new Error(`pg_ctl start failed (code ${startResult.status}):\n${startLog}`);
  }

  const psqlBase = [
    bins.psql,
    '-X',
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-P',
    'pager=off',
    '-h',
    '127.0.0.1',
    '-p',
    String(port),
    '-U',
    'postgres',
    '-d',
    'postgres',
  ];

  function runSqlFile(filePath) {
    const res = spawnSync(psqlBase[0], [...psqlBase.slice(1), '-f', filePath], {
      env,
      encoding: 'utf8',
    });
    if (res.status !== 0) {
      throw new Error(`Failed to apply SQL file ${filePath}:\n${res.stderr || res.stdout}`);
    }
  }

  function runSql(sqlText) {
    const res = spawnSync(psqlBase[0], psqlBase.slice(1), {
      input: sqlText,
      env,
      encoding: 'utf8',
    });
    if (res.status !== 0) {
      throw new Error(`SQL query failed:\n${sqlText}\n${res.stderr || res.stdout}`);
    }
    return res.stdout.trim();
  }

  // 3. Apply migrations in exact required sequence
  // tests/bootstrap_auth.sql + 001-003 + 004
  runSqlFile(path.join(BACKEND_DIR, 'tests', 'bootstrap_auth.sql'));
  runSqlFile(path.join(BACKEND_DIR, 'migrations', '001_schema.sql'));
  runSqlFile(path.join(BACKEND_DIR, 'migrations', '002_commands.sql'));
  runSqlFile(path.join(BACKEND_DIR, 'migrations', '003_api_and_permissions.sql'));
  runSqlFile(path.join(SERVER_DIR, 'sql', '004_own_auth.sql'));
  runSqlFile(path.join(SERVER_DIR, 'sql', '006_height_visibility.sql'));
  runSqlFile(path.join(SERVER_DIR, 'sql', '007_user_status.sql'));
  runSqlFile(path.join(SERVER_DIR, 'sql', '008_oidc_identities.sql'));
  const seedFile = path.join(SERVER_DIR, 'sql', '005_seed_osm_courts.sql');
  if (fs.existsSync(seedFile)) {
    runSqlFile(seedFile);
  }

  const connectionString = `postgres://hoopup_api:hoopup_api_dev_password@127.0.0.1:${port}/postgres`;
  const superuserConnectionString = `postgres://postgres@127.0.0.1:${port}/postgres`;

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      spawnSync(bins.pg_ctl, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
        env,
        stdio: 'ignore',
        timeout: 15000,
      });
    } catch (_) {
      // ignore errors during cleanup
    }
  };

  return {
    port,
    runDir,
    connectionString,
    superuserConnectionString,
    runSql,
    runSqlFile,
    stop,
  };
}
