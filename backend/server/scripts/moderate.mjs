#!/usr/bin/env node
import pg from 'pg';
import os from 'node:os';

const { Client } = pg;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function printUsage() {
  console.error(`Usage:
  node scripts/moderate.mjs ban <email|uuid> [--reason "<text>"]
  node scripts/moderate.mjs unban <email|uuid>
  node scripts/moderate.mjs delete <email|uuid> --confirm
  node scripts/moderate.mjs status <email|uuid>
`);
}

function getActor() {
  if (process.env.MODERATOR && process.env.MODERATOR.trim()) {
    return process.env.MODERATOR.trim();
  }
  try {
    const u = os.userInfo().username;
    if (u) return u;
  } catch (_) {}
  return process.env.USERNAME || process.env.USER || 'system';
}

function printCacheNotice() {
  const cacheMs = parseInt(process.env.USER_STATUS_CACHE_MS || '30000', 10);
  const sec = Math.round((Number.isNaN(cacheMs) ? 30000 : cacheMs) / 1000);
  console.log(`takes effect within ${sec} s on a running server`);
}

function parseArgs(args) {
  const command = args[0];
  const target = args[1];
  let reason = null;
  let confirm = false;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--reason' && i + 1 < args.length) {
      reason = args[i + 1];
      i++;
    } else if (arg.startsWith('--reason=')) {
      reason = arg.slice(9);
    }
  }

  return { command, target, reason, confirm };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { command, target, reason, confirm } = parseArgs(rawArgs);

  if (!command || !['ban', 'unban', 'delete', 'status'].includes(command)) {
    printUsage();
    process.exit(1);
  }

  if (!target) {
    console.error('Error: target <email|uuid> is required');
    printUsage();
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
  } catch (connErr) {
    console.error(`Database connection failed: ${connErr.message}`);
    process.exit(1);
  }

  try {
    // 1. Look up user by UUID or email (never select password_hash)
    const isTargetUuid = UUID_REGEX.test(target);
    const lookupQuery = isTargetUuid
      ? 'SELECT id, email, created_at, banned_at, ban_reason, deleted_at FROM app_auth.users WHERE id = $1;'
      : 'SELECT id, email, created_at, banned_at, ban_reason, deleted_at FROM app_auth.users WHERE email = $1;';
    const lookupParam = isTargetUuid ? target : target.trim().toLowerCase();

    const userRes = await client.query(lookupQuery, [lookupParam]);
    if (userRes.rows.length === 0) {
      console.error(`User not found: ${target}`);
      await client.end();
      process.exit(2);
    }

    const user = userRes.rows[0];
    const actor = getActor();

    if (command === 'ban') {
      await client.query('BEGIN');
      await client.query(
        'UPDATE app_auth.users SET banned_at = now(), ban_reason = $1 WHERE id = $2;',
        [reason, user.id]
      );
      await client.query(
        'INSERT INTO app_auth.moderation_log (user_id, action, reason, actor, created_at) VALUES ($1, $2, $3, $4, now());',
        [user.id, 'ban', reason, actor]
      );
      await client.query('COMMIT');

      console.log(`User ${user.id} (${user.email}) has been banned.`);
      if (reason) {
        console.log(`Reason: ${reason}`);
      }
      printCacheNotice();
      await client.end();
      process.exit(0);
    }

    if (command === 'unban') {
      await client.query('BEGIN');
      await client.query(
        'UPDATE app_auth.users SET banned_at = null, ban_reason = null WHERE id = $1;',
        [user.id]
      );
      await client.query(
        'INSERT INTO app_auth.moderation_log (user_id, action, reason, actor, created_at) VALUES ($1, $2, $3, $4, now());',
        [user.id, 'unban', null, actor]
      );
      await client.query('COMMIT');

      console.log(`User ${user.id} (${user.email}) has been unbanned.`);
      await client.end();
      process.exit(0);
    }

    if (command === 'delete') {
      if (!confirm) {
        console.error("Error: Deleting a user requires the '--confirm' flag.");
        await client.end();
        process.exit(1);
      }

      await client.query('BEGIN');
      await client.query(
        'UPDATE app_auth.users SET deleted_at = now() WHERE id = $1;',
        [user.id]
      );

      // Check if height_visible column exists in public.profiles
      const colRes = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'height_visible';
      `);
      const hasHeightVisible = colRes.rows.length > 0;

      const profileUpdateSql = hasHeightVisible
        ? `UPDATE public.profiles
           SET display_name = 'ผู้ใช้ที่ถูกลบ', avatar_path = null, height_cm = null, height_visible = false
           WHERE id = $1;`
        : `UPDATE public.profiles
           SET display_name = 'ผู้ใช้ที่ถูกลบ', avatar_path = null, height_cm = null
           WHERE id = $1;`;

      await client.query(profileUpdateSql, [user.id]);

      await client.query(
        'INSERT INTO app_auth.moderation_log (user_id, action, reason, actor, created_at) VALUES ($1, $2, $3, $4, now());',
        [user.id, 'delete', reason, actor]
      );
      await client.query('COMMIT');

      console.log(
        `User ${user.id} (${user.email}) deleted (soft delete). Profile row scrubbed (display_name -> ผู้ใช้ที่ถูกลบ, avatar_path -> null, height_cm -> null${hasHeightVisible ? ', height_visible -> false' : ''}). Messages and sessions left untouched.`
      );
      printCacheNotice();
      await client.end();
      process.exit(0);
    }

    if (command === 'status') {
      let status = 'active';
      if (user.deleted_at) {
        status = 'deleted';
      } else if (user.banned_at) {
        status = 'banned';
      }

      const profileRes = await client.query(
        'SELECT display_name, avatar_path, height_cm FROM public.profiles WHERE id = $1;',
        [user.id]
      );
      const profile = profileRes.rows[0] || null;

      console.log(`User ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Status: ${status}`);
      console.log(`Created At: ${user.created_at ? new Date(user.created_at).toISOString() : 'null'}`);
      console.log(`Banned At: ${user.banned_at ? new Date(user.banned_at).toISOString() : 'null'}`);
      console.log(`Ban Reason: ${user.ban_reason || 'null'}`);
      console.log(`Deleted At: ${user.deleted_at ? new Date(user.deleted_at).toISOString() : 'null'}`);
      console.log(`Profile Display Name: ${profile ? profile.display_name : 'null'}`);

      await client.end();
      process.exit(0);
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error(`Moderation command failed: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
