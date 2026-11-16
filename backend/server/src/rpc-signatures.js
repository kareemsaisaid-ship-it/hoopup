/**
 * Hard whitelist of the 15 public.hoopup_* functions defined in migrations/003.
 * No user input is ever interpolated into SQL strings.
 */

const RAW_RPC_WHITELIST = {
  hoopup_save_profile: {
    sqlName: 'public.hoopup_save_profile',
    args: [
      { name: 'p_input', type: 'jsonb', cast: '::jsonb', isJson: true },
    ],
  },
  hoopup_create_session: {
    sqlName: 'public.hoopup_create_session',
    args: [
      { name: 'p_request_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_input', type: 'jsonb', cast: '::jsonb', isJson: true },
    ],
  },
  hoopup_get_session: {
    sqlName: 'public.hoopup_get_session',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
    ],
  },
  hoopup_list_sessions: {
    sqlName: 'public.hoopup_list_sessions',
    args: [
      { name: 'p_filter', type: 'jsonb', cast: '::jsonb', isJson: true, default: {} },
    ],
  },
  hoopup_my_sessions: {
    sqlName: 'public.hoopup_my_sessions',
    args: [
      { name: 'p_limit', type: 'integer', cast: '::integer', default: 20 },
      { name: 'p_offset', type: 'integer', cast: '::integer', default: 0 },
    ],
  },
  hoopup_join_session: {
    sqlName: 'public.hoopup_join_session',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_position', type: 'text', cast: '::text', default: null },
    ],
  },
  hoopup_decide_request: {
    sqlName: 'public.hoopup_decide_request',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_user_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_approve', type: 'boolean', cast: '::boolean' },
    ],
  },
  hoopup_withdraw: {
    sqlName: 'public.hoopup_withdraw',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
    ],
  },
  hoopup_update_session: {
    sqlName: 'public.hoopup_update_session',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_patch', type: 'jsonb', cast: '::jsonb', isJson: true },
    ],
  },
  hoopup_set_recruitment: {
    sqlName: 'public.hoopup_set_recruitment',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_open', type: 'boolean', cast: '::boolean' },
    ],
  },
  hoopup_end_session: {
    sqlName: 'public.hoopup_end_session',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_lifecycle', type: 'text', cast: '::text' },
    ],
  },
  hoopup_send_message: {
    sqlName: 'public.hoopup_send_message',
    args: [
      { name: 'p_session_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_client_message_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_body', type: 'text', cast: '::text' },
    ],
  },
  hoopup_block_user: {
    sqlName: 'public.hoopup_block_user',
    args: [
      { name: 'p_user_id', type: 'uuid', cast: '::uuid' },
    ],
  },
  hoopup_unblock_user: {
    sqlName: 'public.hoopup_unblock_user',
    args: [
      { name: 'p_user_id', type: 'uuid', cast: '::uuid' },
    ],
  },
  hoopup_report: {
    sqlName: 'public.hoopup_report',
    args: [
      { name: 'p_target_type', type: 'text', cast: '::text' },
      { name: 'p_target_id', type: 'uuid', cast: '::uuid' },
      { name: 'p_reason', type: 'text', cast: '::text' },
    ],
  },
};

// B3: Create RPC_WHITELIST as null-prototype object so prototype keys (constructor, toString, etc.) do not exist
export const RPC_WHITELIST = Object.assign(Object.create(null), RAW_RPC_WHITELIST);

// Pre-build the exact static SQL string for each whitelist entry
for (const [name, def] of Object.entries(RPC_WHITELIST)) {
  const paramPlaceholders = def.args.map((arg, idx) => `$${idx + 1}${arg.cast}`).join(', ');
  def.sql = `SELECT ${def.sqlName}(${paramPlaceholders}) AS result;`;
}

/**
 * Extracts and maps arguments from the request body to parameter array.
 */
export function buildRpcParameters(def, body = {}) {
  const params = [];
  const b = body && typeof body === 'object' ? body : {};

  for (const arg of def.args) {
    const rawName = arg.name; // e.g. 'p_session_id'
    const shortName = rawName.replace(/^p_/, ''); // e.g. 'session_id'
    const camelName = shortName.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // e.g. 'sessionId'

    let val;
    if (Object.prototype.hasOwnProperty.call(b, rawName)) {
      val = b[rawName];
    } else if (Object.prototype.hasOwnProperty.call(b, shortName)) {
      val = b[shortName];
    } else if (Object.prototype.hasOwnProperty.call(b, camelName)) {
      val = b[camelName];
    } else {
      val = arg.default !== undefined ? arg.default : null;
    }

    if (arg.isJson) {
      if (val === null || val === undefined) {
        val = null;
      } else if (typeof val === 'object') {
        val = JSON.stringify(val);
      } else if (typeof val !== 'string') {
        val = JSON.stringify(val);
      }
    }

    params.push(val);
  }

  return params;
}

/**
 * Map PostgreSQL SQLSTATE and errors according to backend/README.md and API_TH.md.
 * B4: Returns fixed generic messages + machine codes; detail is kept only in server logs.
 */
export function mapSqlError(err) {
  const code = err.code || '';
  const message = err.message || '';

  // 42501: insufficient_privilege / authentication_required
  if (code === '42501') {
    if (message.includes('authentication_required')) {
      return { status: 401, body: { ok: false, code: 'authentication_required', error: 'Authentication required' } };
    }
    return { status: 403, body: { ok: false, code: 'forbidden', error: 'Access forbidden' } };
  }

  // 23514: check_violation
  if (code === '23514') {
    if (message.includes('session_capacity_exceeded')) {
      return { status: 409, body: { ok: false, code: 'session_capacity_exceeded', error: 'Session capacity exceeded' } };
    }
    if (message.includes('session_requires_confirmed_host')) {
      return { status: 400, body: { ok: false, code: 'invalid_action', error: 'Session requires confirmed host' } };
    }
    return { status: 400, body: { ok: false, code: 'invalid_input', error: 'Invalid input data' } };
  }

  // 23505: unique_violation
  if (code === '23505') {
    return { status: 409, body: { ok: false, code: 'conflict', error: 'Resource conflict or duplicate entry' } };
  }

  // 23503: foreign_key_violation
  if (code === '23503') {
    if (message.includes('profiles') || message.includes('auth.users')) {
      return { status: 400, body: { ok: false, code: 'profile_required', error: 'Profile required' } };
    }
    return { status: 400, body: { ok: false, code: 'invalid_input', error: 'Referenced entity not found' } };
  }

  // 23502: not_null_violation
  // 22...: data exception (e.g. 22P02 invalid UUID / type syntax)
  if (code === '23502' || code.startsWith('22')) {
    return { status: 400, body: { ok: false, code: 'invalid_input', error: 'Invalid input format' } };
  }

  // 40001: serialization_failure, 40P01: deadlock_detected
  if (code === '40001' || code === '40P01') {
    return { status: 409, body: { ok: false, code: 'conflict', error: 'Transaction conflict, please retry' } };
  }

  // P0001: custom raise_exception
  if (code === 'P0001') {
    return { status: 400, body: { ok: false, code: 'invalid_action', error: 'Invalid operation' } };
  }

  // 57014: query_canceled / statement_timeout
  if (code === '57014') {
    return { status: 503, body: { ok: false, code: 'service_unavailable', error: 'Service temporarily unavailable' } };
  }

  return { status: 500, body: { ok: false, code: 'internal_server_error', error: 'Internal server error' } };
}
