import { getErrorMessage } from './errors';
import {
  mapBackendCommandResult,
  mapCourtRowToCourt,
  mapProfileRowToUserProfile,
} from './contractMapping';
import type {
  AuthService,
  ChatMessage,
  CommandResult,
  Court,
  CourtRow,
  DataService,
  FeedFilter,
  MessageRow,
  Position,
  ProfileInput,
  ProfileRow,
  SessionInput,
  SessionMember,
  SessionMemberRow,
  SessionSummary,
  UserProfile,
  UUID,
} from './types';

const ACCESS_TOKEN_STORAGE_KEY = 'hoopup_access_token';

function safeGetSessionToken(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSetSessionToken(token: string | null): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (token) {
      sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Gracefully handle storage quota or security exceptions
  }
}

function createFallbackProfile(userId: string, email?: string): UserProfile {
  const name = email ? email.split('@')[0] : 'ผู้เล่น';
  return {
    id: userId,
    displayName: name,
    avatarPath: null,
    skillLevel: 'casual',
    primaryPosition: null,
    secondaryPosition: null,
    playsAnyPosition: true,
    heightCm: null,
    heightVisible: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export class ApiAuthService implements AuthService {
  private baseUrl: string;
  private token: string | null = null;
  private currentUser: UserProfile | null = null;
  private subscribers: Set<(user: UserProfile | null) => void> = new Set();
  private initPromise: Promise<void> | null = null;
  public isDemoMode = false;
  public isConfigured: boolean;

  constructor(customBaseUrl?: string) {
    const envUrl = typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_API_BASE_URL
      : undefined;
    this.baseUrl = (customBaseUrl || envUrl || '').replace(/\/+$/, '');
    this.isConfigured = Boolean(this.baseUrl && this.baseUrl.startsWith('http'));

    if (this.isConfigured) {
      const savedToken = safeGetSessionToken();
      if (savedToken) {
        this.token = savedToken;
        this.initPromise = this.initAuth();
      }
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getAccessToken(): string | null {
    return this.token;
  }

  public setCurrentUser(user: UserProfile | null): void {
    this.currentUser = user;
    this.notifySubscribers();
  }

  private async initAuth(): Promise<void> {
    if (!this.token) {
      this.currentUser = null;
      this.notifySubscribers();
      return;
    }

    try {
      const res = await fetch(`${this.baseUrl}/auth/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        // 401 or invalid token
        this.handleUnauthorized();
        return;
      }

      const data = await res.json();
      if (data && data.user) {
        if (data.profile) {
          this.currentUser = mapProfileRowToUserProfile(data.profile);
        } else {
          this.currentUser = createFallbackProfile(data.user.id, data.user.email);
        }
      } else {
        this.handleUnauthorized();
      }
    } catch {
      // In case of network errors during initial check, sign out cleanly
      this.handleUnauthorized();
    } finally {
      this.notifySubscribers();
    }
  }

  public handleUnauthorized(): void {
    this.token = null;
    safeSetSessionToken(null);
    this.currentUser = null;
    this.notifySubscribers();
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  public subscribe(callback: (user: UserProfile | null) => void): () => void {
    this.subscribers.add(callback);
    if (this.initPromise) {
      this.initPromise.finally(() => {
        callback(this.currentUser);
      });
    } else {
      callback(this.currentUser);
    }
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    this.subscribers.forEach((fn) => fn(this.currentUser));
  }

  public async signIn(params: {
    email?: string;
    password?: string;
    demoUserId?: UUID;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { ok: false, error: 'ระบบยังไม่ได้ตั้งค่า VITE_API_BASE_URL' };
    }

    if (!params.email || !params.password) {
      return { ok: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: params.email,
          password: params.password,
        }),
      });

      if (res.status === 401) {
        return { ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
      }

      if (res.status === 429) {
        return { ok: false, error: 'ระบบกำลังประมวลผลคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่' };
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: errorData.error || 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลอีกครั้ง',
        };
      }

      const data = await res.json();
      if (!data.accessToken) {
        return { ok: false, error: 'ไม่พบ Access Token จากเซิร์ฟเวอร์' };
      }

      this.token = data.accessToken;
      safeSetSessionToken(this.token);

      if (data.user) {
        this.currentUser = createFallbackProfile(data.user.id, data.user.email);
        this.notifySubscribers();
      }

      // Load profile via /auth/me
      try {
        await this.initAuth();
      } catch {
        // Fallback user is already active
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง' };
    }
  }

  public async signUp(params: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { ok: false, error: 'ระบบยังไม่ได้ตั้งค่า VITE_API_BASE_URL' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: params.email,
          password: params.password,
          displayName: params.displayName,
        }),
      });

      if (res.status === 409) {
        return { ok: false, error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' };
      }

      if (res.status === 429) {
        return { ok: false, error: 'ระบบกำลังประมวลผลคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่' };
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { ok: false, error: errJson.error || 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
      }

      const data = await res.json();
      if (!data.accessToken) {
        return { ok: false, error: 'เซิร์ฟเวอร์ไม่ได้ส่งโทเค็นกลับมา' };
      }

      this.token = data.accessToken;
      safeSetSessionToken(this.token);

      if (data.user) {
        this.currentUser = createFallbackProfile(data.user.id, data.user.email);
        if (params.displayName) {
          this.currentUser.displayName = params.displayName;
        }
        this.notifySubscribers();
      }

      try {
        await this.initAuth();
      } catch {
        // Fallback user is already active
      }
      return { ok: true };

    } catch {
      return { ok: false, error: 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง' };
    }
  }

  public async signOut(): Promise<void> {
    if (this.token && this.isConfigured) {
      try {
        await fetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
      } catch {
        // Stateless JWT logout: ignore network failures
      }
    }
    this.handleUnauthorized();
  }

  public async switchDemoUser(): Promise<void> {
    throw new Error('การสลับบัญชีผู้ใช้จำลองใช้ได้เฉพาะในโหมด Demo เท่านั้น');
  }

  public listDemoUsers(): UserProfile[] {
    return [];
  }
}

export class ApiDataService implements DataService {
  private auth: ApiAuthService;
  private baseUrl: string;
  private profileCache = new Map<string, UserProfile>();

  constructor(auth: ApiAuthService, customBaseUrl?: string) {
    this.auth = auth;
    this.baseUrl = (customBaseUrl || auth.getBaseUrl() || '').replace(/\/+$/, '');
  }

  private ensureConfigured(): void {
    if (!this.auth.isConfigured) {
      throw new Error('API server environment is not configured.');
    }
  }

  /**
   * Helper for GET requests.
   * Cleans 401, maps 429/5xx safely to Thai errors, ensures token is never included in errors.
   */
  private async getRequest<T>(endpoint: string): Promise<T> {
    this.ensureConfigured();
    const token = this.auth.getAccessToken();

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers,
      });
    } catch {
      throw new Error(getErrorMessage('network_error'));
    }

    if (res.status === 401) {
      this.auth.handleUnauthorized();
      throw new Error(getErrorMessage('forbidden'));
    }

    if (res.status === 429) {
      throw new Error(getErrorMessage('40001'));
    }

    if (res.status >= 500) {
      throw new Error(getErrorMessage('network_error'));
    }

    if (!res.ok) {
      throw new Error(getErrorMessage('invalid_action'));
    }

    return (await res.json()) as T;
  }

  /**
   * Helper for RPC calls (/rpc/:name).
   */
  private async rpcCall(fnName: string, body: Record<string, unknown>): Promise<unknown> {
    this.ensureConfigured();
    const token = this.auth.getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/rpc/${fnName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, code: 'network_error', message: getErrorMessage('network_error') };
    }

    if (res.status === 401) {
      this.auth.handleUnauthorized();
      return { ok: false, code: 'forbidden', message: getErrorMessage('forbidden') };
    }

    if (res.status === 429) {
      return { ok: false, code: 'conflict', message: getErrorMessage('40001') };
    }

    try {
      return await res.json();
    } catch {
      return { ok: false, code: 'network_error', message: getErrorMessage('network_error') };
    }
  }

  public async listCourts(): Promise<Court[]> {
    const rows = await this.getRequest<CourtRow[]>('/courts');
    return rows.map(mapCourtRowToCourt);
  }

  public async getProfile(userId?: UUID): Promise<UserProfile | null> {
    this.ensureConfigured();
    const targetId = userId || this.auth.getCurrentUser()?.id;
    if (!targetId) return null;

    if (this.profileCache.has(targetId)) {
      return this.profileCache.get(targetId)!;
    }

    const token = this.auth.getAccessToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${this.baseUrl}/profiles/${targetId}`, {
        method: 'GET',
        headers,
      });

      if (res.status === 404) return null;
      if (res.status === 401) {
        this.auth.handleUnauthorized();
        return null;
      }
      if (!res.ok) return null;

      const row = (await res.json()) as ProfileRow;
      const profile = mapProfileRowToUserProfile(row);
      this.profileCache.set(targetId, profile);
      return profile;
    } catch {
      return null;
    }
  }

  public async listSessions(filter?: FeedFilter): Promise<SessionSummary[]> {
    const result = await this.rpcCall('hoopup_list_sessions', {
      p_filter: filter || {},
    });
    if (Array.isArray(result)) {
      return result as SessionSummary[];
    }
    return [];
  }

  public async getSession(sessionId: UUID): Promise<SessionSummary | null> {
    const result = await this.rpcCall('hoopup_get_session', {
      p_session_id: sessionId,
    });
    if (!result || typeof result !== 'object') return null;
    if ((result as Record<string, unknown>).ok === false) return null;
    return result as SessionSummary;
  }

  public async listMySessions(options?: { limit?: number; offset?: number }): Promise<SessionSummary[]> {
    const result = await this.rpcCall('hoopup_my_sessions', {
      p_limit: options?.limit ?? 20,
      p_offset: options?.offset ?? 0,
    });
    if (Array.isArray(result)) {
      return result as SessionSummary[];
    }
    return [];
  }

  public async listMembers(sessionId: UUID): Promise<SessionMember[]> {
    const rows = await this.getRequest<SessionMemberRow[]>(`/session_members/${sessionId}`);
    const current = this.auth.getCurrentUser();

    // Enrich with display names and avatars from cache or /profiles
    const members: SessionMember[] = await Promise.all(
      rows.map(async (r) => {
        let name = 'ผู้เล่น';
        let avatar: string | null = null;

        if (current && r.user_id === current.id) {
          name = current.displayName;
          avatar = current.avatarPath;
        } else {
          const profile = await this.getProfile(r.user_id);
          if (profile) {
            name = profile.displayName;
            avatar = profile.avatarPath;
          }
        }

        return {
          sessionId: r.session_id,
          userId: r.user_id,
          displayName: name,
          avatarPath: avatar,
          status: r.status,
          position: r.position,
          requestedAt: r.requested_at,
          confirmedAt: r.confirmed_at,
          decidedBy: r.decided_by,
          updatedAt: r.updated_at,
        };
      })
    );

    return members;
  }

  public async listMessages(sessionId: UUID, limit = 50): Promise<ChatMessage[]> {
    const rows = await this.getRequest<MessageRow[]>(`/messages?sessionId=${sessionId}&limit=${limit}`);
    const current = this.auth.getCurrentUser();

    // Map rows in chronological order (newest-50 then oldest-first)
    const messages: ChatMessage[] = await Promise.all(
      rows.map(async (r) => {
        let senderName = 'ผู้เล่น';
        if (current && r.sender_id === current.id) {
          senderName = current.displayName;
        } else {
          const profile = await this.getProfile(r.sender_id);
          if (profile) {
            senderName = profile.displayName;
          }
        }

        return {
          id: r.id,
          sessionId: r.session_id,
          senderId: r.sender_id,
          senderName,
          clientMessageId: r.client_message_id,
          body: r.body,
          createdAt: r.created_at,
        };
      })
    );

    return messages;
  }

  public async saveProfile(input: ProfileInput): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_save_profile', {
      p_input: input,
    });
    const mapped = mapBackendCommandResult(res);
    if (mapped.ok && mapped.profile) {
      const user = mapped.profile as UserProfile;
      this.profileCache.set(user.id, user);
      const current = this.auth.getCurrentUser();
      if (current && current.id === user.id) {
        this.auth.setCurrentUser(user);
      }
    }
    return mapped;
  }

  public async createSession(requestId: UUID, input: SessionInput): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_create_session', {
      p_request_id: requestId,
      p_input: input,
    });
    return mapBackendCommandResult(res);
  }

  public async updateSession(sessionId: UUID, patch: Partial<SessionInput>): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_update_session', {
      p_session_id: sessionId,
      p_patch: patch,
    });
    return mapBackendCommandResult(res);
  }

  public async joinSession(sessionId: UUID, position?: Position | null): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_join_session', {
      p_session_id: sessionId,
      p_position: position || null,
    });
    return mapBackendCommandResult(res);
  }

  public async decideRequest(sessionId: UUID, userId: UUID, approve: boolean): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_decide_request', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_approve: approve,
    });
    return mapBackendCommandResult(res);
  }

  public async withdraw(sessionId: UUID): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_withdraw', {
      p_session_id: sessionId,
    });
    return mapBackendCommandResult(res);
  }

  public async setRecruitment(sessionId: UUID, open: boolean): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_set_recruitment', {
      p_session_id: sessionId,
      p_open: open,
    });
    return mapBackendCommandResult(res);
  }

  public async endSession(sessionId: UUID, lifecycle: 'completed' | 'cancelled'): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_end_session', {
      p_session_id: sessionId,
      p_lifecycle: lifecycle,
    });
    return mapBackendCommandResult(res);
  }

  public async sendMessage(sessionId: UUID, clientMessageId: UUID, body: string): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_send_message', {
      p_session_id: sessionId,
      p_client_message_id: clientMessageId,
      p_body: body,
    });
    return mapBackendCommandResult(res);
  }

  public async blockUser(userId: UUID): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_block_user', {
      p_user_id: userId,
    });
    return mapBackendCommandResult(res);
  }

  public async unblockUser(userId: UUID): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_unblock_user', {
      p_user_id: userId,
    });
    return mapBackendCommandResult(res);
  }

  public async report(
    targetType: 'user' | 'session' | 'message',
    targetId: UUID,
    reason: string
  ): Promise<CommandResult> {
    const res = await this.rpcCall('hoopup_report', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason,
    });
    return mapBackendCommandResult(res);
  }
}
