import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { startTempPostgres, findFreePort } from '../../backend/server/test/helpers/temp-postgres.js';
import { buildApp } from '../../backend/server/src/app.js';
import { initPool, closePool } from '../../backend/server/src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');

async function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200 || res.status === 304) return true;
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for URL: ${url}`);
}

async function main() {
  const vitePort = parseInt(process.env.CONNECTED_VITE_PORT || '5199', 10);
  const backendPort = await findFreePort();
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = jwtSecret;

  // (a) Start isolated PostgreSQL cluster with migrations 001-004 + auth stub
  const tempPg = await startTempPostgres();
  process.env.DATABASE_URL = tempPg.connectionString;

  // Seed standard courts for connected UI testing
  tempPg.runSql(`
    INSERT INTO public.courts (id, name, address, latitude, longitude, surface_type, is_indoor, has_lighting, hoop_count)
    VALUES
      ('c1111111-1111-4111-8111-111111111111', 'สวนเบญจกิติ (Benjakitti Forest Park Court)', 'ถ.รัชดาภิเษก คลองเตย กทม.', 13.7297, 100.5583, 'Polyurethane Outdoor', false, true, 4),
      ('c2222222-2222-4222-8222-222222222222', 'สวนลุมพินี (Lumpini Park Court)', 'ถ.พระรามที่ 4 แขวงลุมพินี เขตปทุมวัน กทม.', 13.7317, 100.5414, 'Asphalt Outdoor', false, true, 2),
      ('c3333333-3333-4333-8333-333333333333', 'สนามบาสเกตบอล กกท. หัวหมาก', 'ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กทม.', 13.7558, 100.6225, 'Indoor Parquet', true, true, 6)
    ON CONFLICT (id) DO NOTHING;
  `);

  // (b) Start backend server from backend/server on a free port with random JWT secret
  initPool({ databaseUrl: tempPg.connectionString });
  const app = buildApp({
    jwtSecret,
    allowedOrigins: `http://localhost:${vitePort},http://127.0.0.1:${vitePort}`,
    authRateLimitMax: 1000,
    authRateLimitWindowMs: 60000,
    logger: false,
  });

  await app.listen({ port: backendPort, host: '127.0.0.1' });
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const viteUrl = `http://localhost:${vitePort}`;

  // (c) Start vite with VITE_API_BASE_URL pointing to the backend
  const viteBin = path.join(APP_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteProcess = spawn(
    process.execPath,
    [viteBin, '--port', String(vitePort), '--strictPort'],
    {
      cwd: APP_DIR,
      env: {
        ...process.env,
        VITE_API_BASE_URL: backendUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Clean shutdown coordination
  const envFilePath = path.join(APP_DIR, '.connected-env.json');
  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    try {
      if (fs.existsSync(envFilePath)) {
        fs.unlinkSync(envFilePath);
      }
    } catch {}
    try {
      if (viteProcess && viteProcess.pid) {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(viteProcess.pid), '/f', '/t']);
        } else {
          viteProcess.kill('SIGTERM');
        }
      }
    } catch {}
    try {
      await app.close();
      await closePool();
    } catch {}
    try {
      tempPg.stop();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  // Wait for Vite server to be reachable
  await waitForUrl(viteUrl, 30000);

  // (d) Print JSON line with URLs, write to file and stay alive
  const envInfo = {
    backendUrl,
    viteUrl,
    pgPort: tempPg.port,
    status: 'ready',
  };
  fs.writeFileSync(envFilePath, JSON.stringify(envInfo, null, 2));
  console.log(JSON.stringify(envInfo));

  // Keep alive until killed
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Failed to start connected environment:', err);
  process.exit(1);
});
