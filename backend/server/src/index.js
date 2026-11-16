import { buildApp } from './app.js';
import { initPool, closePool } from './db.js';

const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '127.0.0.1';

initPool();

const app = buildApp();

async function start() {
  try {
    const address = await app.listen({ port, host });
    app.log.info(`HoopUp Backend Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    await closePool();
    process.exit(1);
  }
}

const shutdown = async () => {
  app.log.info('Shutting down server...');
  await app.close();
  await closePool();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
