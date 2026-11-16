import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from './errors';
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

export class SupabaseAuthService implements AuthService {
  private client: SupabaseClient | null = null;
  private currentUser: UserProfile | null = null;
  private subscribers: Set<(user: UserProfile | null) => void> = new Set();
  public isDemoMode = false;
  public isConfigured: boolean;

  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    this.isConfigured = Boolean(url && anonKey && url.startsWith('http'));

    if (this.isConfigured) {
      this.client = createClient(url, anonKey);
      this.initAuth();
    }
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }

  private async initAuth() {
    if (!this.client) return;

    try {
      const {
        data: { session },
      } = await this.client.auth.getSession();
      if (session?.user) {
        await this.loadUserProfile(session.user.id);
      }

      this.client.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          await this.loadUserProfile(session.user.id);
        } else {
          this.currentUser = null;
          this.notifySubscribers();
        }
      });
    } catch {
      this.currentUser = null;
      this.notifySubscribers();
    }
  }

  private async loadUserProfile(userId: string) {
    if (!this.client) return;
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single<ProfileRow>();

      if (!error && data) {
        this.currentUser = {
          id: data.id,
          displayName: data.display_name,
          avatarPath: data.avatar_path,
          skillLevel: data.skill_level,
          primaryPosition: data.primary_position,
          secondaryPosition: data.secondary_position,
          playsAnyPosition: data.plays_any_position,
          heightCm: data.height_cm,
          heightVisible: Boolean(data.height_visible),
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      } else {
        // Fallback minimal profile if row not created yet
        this.currentUser = {
          id: userId,
          displayName: 'ผู้เล่นใหม่',
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
      this.notifySubscribers();
    } catch {
      this.currentUser = null;
      this.notifySubscribers();
    }
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  public subscribe(callback: (user: UserProfile | null) => void): () => void {
    this.subscribers.add(callback);
    callback(this.currentUser);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    this.subscribers.forEach((fn) => fn(this.currentUser));
  }

  public async signIn(params: { email?: string; password?: string }): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured || !this.client) {
      return { ok: false, error: 'ระบบยังไม่ได้เชื่อมต่อกับ Supabase กรุณาตั้งค่า .env หรือใช้ Demo' };
    }

    if (!params.email || !params.password) {
      return { ok: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' };
    }

    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: params.email,
        password: params.password,
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      if (data.user) {
        await this.loadUserProfile(data.user.id);
      }
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      return { ok: false, error: msg };
    }
  }

  public async signOut(): Promise<void> {
    if (this.client) {
      await this.client.auth.signOut();
    }
    this.currentUser = null;
    this.notifySubscribers();
  }

  public async switchDemoUser(): Promise<void> {
    throw new Error('การสลับบัญชีผู้ใช้จำลองใช้ได้เฉพาะในโหมด Demo เท่านั้น');
  }

  public listDemoUsers(): UserProfile[] {
    return [];
  }
}

import {
  mapProfileRowToUserProfile,
  mapBackendCommandResult,
  mapCourtRowToCourt,
} from './contractMapping';
export { mapProfileRowToUserProfile, mapBackendCommandResult, mapCourtRowToCourt };


export class SupabaseDataService implements DataService {
  private auth: SupabaseAuthService;

  constructor(auth: SupabaseAuthService) {
    this.auth = auth;
  }

  private getClient(): SupabaseClient {
    const client = this.auth.getClient();
    if (!client) {
      throw new Error('Supabase client is not configured.');
    }
    return client;
  }

  private ensureConfigured(): void {
    if (!this.auth.isConfigured) {
      throw new Error('Supabase environment is not configured.');
    }
  }

  public async listCourts(): Promise<Court[]> {
    this.ensureConfigured();
    const { data, error } = await this.getClient()
      .from('courts')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw new Error(getErrorMessage(error.code, error.message));
    }

    return (data as CourtRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      surfaceType: r.surface_type,
      isIndoor: r.is_indoor,
      hasLighting: r.has_lighting,
      hoopCount: r.hoop_count,
      openingHoursNote: r.opening_hours_note,
      photoPath: r.photo_path,
      verifiedAt: r.verified_at,
    }));
  }

  public async getProfile(userId?: UUID): Promise<UserProfile | null> {
    this.ensureConfigured();
    const targetId = userId || this.auth.getCurrentUser()?.id;
    if (!targetId) return null;

    const { data, error } = await this.getClient()
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .single<ProfileRow>();

    if (error || !data) return null;

    return mapProfileRowToUserProfile(data);
  }

  public async listSessions(filter?: FeedFilter): Promise<SessionSummary[]> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_list_sessions', {
      p_filter: filter || {},
    });

    if (error) {
      throw new Error(getErrorMessage(error.code, error.message));
    }

    return (data as SessionSummary[]) || [];
  }

  public async getSession(sessionId: UUID): Promise<SessionSummary | null> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_get_session', {
      p_session_id: sessionId,
    });

    if (error) {
      throw new Error(getErrorMessage(error.code, error.message));
    }

    return (data as SessionSummary) || null;
  }

  public async listMySessions(options?: { limit?: number; offset?: number }): Promise<SessionSummary[]> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_my_sessions', {
      p_limit: options?.limit ?? 20,
      p_offset: options?.offset ?? 0,
    });

    if (error) {
      throw new Error(getErrorMessage(error.code, error.message));
    }

    return (data as SessionSummary[]) || [];
  }

  public async listMembers(sessionId: UUID): Promise<SessionMember[]> {
    this.ensureConfigured();
    const { data, error } = await this.getClient()
      .from('session_members')
      .select('*, profiles!session_members_user_id_fkey(display_name, avatar_path)')
      .eq('session_id', sessionId)
      .order('requested_at', { ascending: true });

    if (error) {
      throw new Error(getErrorMessage(error.code, error.message));
    }

    type MemberWithProfile = SessionMemberRow & {
      profiles?: { display_name: string; avatar_path: string | null } | null;
    };

    return ((data as unknown) as MemberWithProfile[]).map((r) => ({
      sessionId: r.session_id,
      userId: r.user_id,
      displayName: r.profiles?.display_name || 'ผู้เล่น',
      avatarPath: r.profiles?.avatar_path || null,
      status: r.status,
      position: r.position,
      requestedAt: r.requested_at,
      confirmedAt: r.confirmed_at,
      decidedBy: r.decided_by,
      updatedAt: r.updated_at,
    }));
  }

  public async listMessages(sessionId: UUID, limit = 50): Promise<ChatMessage[]> {
    this.ensureConfigured();
    const { data, error } = await this.getClient()
      .from('messages')
      .select('*, profiles!messages_sender_id_fkey(display_name)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(getErrorMessage(error.code, error.message));
    }

    type MessageWithProfile = MessageRow & {
      profiles?: { display_name: string } | null;
    };

    const rows = ((data as unknown) as MessageWithProfile[]) || [];

    return rows.reverse().map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      senderId: r.sender_id,
      senderName: r.profiles?.display_name || 'ผู้เล่น',
      clientMessageId: r.client_message_id,
      body: r.body,
      createdAt: r.created_at,
    }));
  }

  public async saveProfile(input: ProfileInput): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_save_profile', {
      p_input: input,
    });

    if (error) {
      return { ok: false, code: 'invalid_input', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async createSession(requestId: UUID, input: SessionInput): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_create_session', {
      p_request_id: requestId,
      p_input: input,
    });

    if (error) {
      return { ok: false, code: 'invalid_input', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async updateSession(sessionId: UUID, patch: Partial<SessionInput>): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_update_session', {
      p_session_id: sessionId,
      p_patch: patch,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async joinSession(sessionId: UUID, position?: Position | null): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_join_session', {
      p_session_id: sessionId,
      p_position: position || null,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async decideRequest(sessionId: UUID, userId: UUID, approve: boolean): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_decide_request', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_approve: approve,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async withdraw(sessionId: UUID): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_withdraw', {
      p_session_id: sessionId,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async setRecruitment(sessionId: UUID, open: boolean): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_set_recruitment', {
      p_session_id: sessionId,
      p_open: open,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async endSession(sessionId: UUID, lifecycle: 'completed' | 'cancelled'): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_end_session', {
      p_session_id: sessionId,
      p_lifecycle: lifecycle,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async sendMessage(sessionId: UUID, clientMessageId: UUID, body: string): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_send_message', {
      p_session_id: sessionId,
      p_client_message_id: clientMessageId,
      p_body: body,
    });

    if (error) {
      return { ok: false, code: 'invalid_input', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async blockUser(userId: UUID): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_block_user', {
      p_user_id: userId,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async unblockUser(userId: UUID): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_unblock_user', {
      p_user_id: userId,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }

  public async report(targetType: 'user' | 'session' | 'message', targetId: UUID, reason: string): Promise<CommandResult> {
    this.ensureConfigured();
    const { data, error } = await this.getClient().rpc('hoopup_report', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason,
    });

    if (error) {
      return { ok: false, code: 'invalid_action', message: getErrorMessage(error.code, error.message) };
    }

    return mapBackendCommandResult(data);
  }
}
