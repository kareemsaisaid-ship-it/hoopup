/**
 * HoopUp MVP Shared Data and Service Contract Types
 * Shared between G1 (Platform), G2 (Discovery & Profile), G3 (Sessions & Chat), and G4 (QA).
 */

export type UUID = string;
export type ISODateTime = string;
export type SkillLevel = 'casual' | 'regular' | 'competitive';
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type MemberStatus = 'pending' | 'confirmed' | 'declined' | 'withdrawn';
export type Lifecycle = 'active' | 'completed' | 'cancelled';
export type DisplayStatus = 'open' | 'full' | 'closed' | 'completed' | 'cancelled';

export interface SessionInput {
  title: string;
  courtId: UUID;
  /** null or omitted = use current clock for "ตอนนี้". Otherwise an ISO future instant. */
  startsAt?: ISODateTime | null;
  teamSize: 3 | 5;
  /** Friends without an app membership, excluding the host. */
  guestCount?: number;
  skillLevel?: SkillLevel;
  welcomesBeginners?: boolean;
  /** [] = any position; advisory preferences, not mandatory one-per-position slots. */
  wantedPositions?: Position[];
  joinPolicy?: 'instant' | 'approval';
  meetingPoint?: string;
  notes?: string;
}

export interface SessionSummary {
  id: UUID;
  title: string;
  hostId: UUID;
  hostName: string;
  court: { id: UUID; name: string; latitude: number | null; longitude: number | null };
  startsAt: ISODateTime;
  teamSize: 3 | 5;
  /** Includes the host. Do not add another 1. */
  confirmedCount: number;
  guestCount: number;
  occupiedCount: number;
  seatsRemaining: number;
  skillLevel: SkillLevel;
  welcomesBeginners: boolean;
  wantedPositions: Position[];
  joinPolicy: 'instant' | 'approval';
  lifecycle: Lifecycle;
  recruitmentOpen: boolean;
  displayStatus: DisplayStatus;
  myMembershipStatus: MemberStatus | null;
  meetingPoint: string;
  notes: string;
  updatedAt: ISODateTime;
  endedAt: ISODateTime | null;
  actions: {
    canManage: boolean;
    canJoin: boolean;
    canReadChat: boolean;
    canSendMessage: boolean;
    canWithdraw: boolean;
  };
}

export interface FeedFilter {
  courtId?: UUID;
  teamSize?: 3 | 5;
  skillLevel?: SkillLevel;
  from?: ISODateTime;
  /** exclusive upper bound */
  to?: ISODateTime;
  limit?: number;
  offset?: number;
}

export interface Court {
  id: UUID;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  surfaceType: string | null;
  isIndoor: boolean | null;
  hasLighting: boolean | null;
  hoopCount: number | null;
  openingHoursNote: string | null;
  photoPath: string | null;
  verifiedAt: ISODateTime | null;
  osmQuality?: 'excluded' | 'positive' | 'unverified';
  access?: string | null;
  fee?: string | null;
  operator?: string | null;
}

export interface SessionMember {
  sessionId: UUID;
  userId: UUID;
  displayName: string;
  avatarPath: string | null;
  status: MemberStatus;
  position: Position | null;
  requestedAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  decidedBy: UUID | null;
  updatedAt: ISODateTime;
}

export interface ChatMessage {
  id: UUID;
  sessionId: UUID;
  senderId: UUID;
  senderName: string;
  clientMessageId: UUID;
  body: string;
  createdAt: ISODateTime;
}

export interface ProfileInput {
  displayName: string;
  avatarPath?: string | null;
  skillLevel?: SkillLevel;
  primaryPosition?: Position | null;
  secondaryPosition?: Position | null;
  playsAnyPosition?: boolean;
  heightCm?: number | null;
  heightVisible?: boolean;
}

export interface UserProfile {
  id: UUID;
  displayName: string;
  avatarPath: string | null;
  skillLevel: SkillLevel;
  primaryPosition: Position | null;
  secondaryPosition: Position | null;
  playsAnyPosition: boolean;
  heightCm: number | null;
  heightVisible: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MessageRow {
  id: UUID;
  session_id: UUID;
  sender_id: UUID;
  client_message_id: UUID;
  body: string;
  created_at: ISODateTime;
}

export interface ProfileRow {
  id: UUID;
  display_name: string;
  avatar_path: string | null;
  skill_level: SkillLevel;
  primary_position: Position | null;
  secondary_position: Position | null;
  plays_any_position: boolean;
  height_cm: number | null;
  height_visible?: boolean | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CourtRow {
  id: UUID;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  surface_type: string | null;
  is_indoor: boolean | null;
  has_lighting: boolean | null;
  hoop_count: number | null;
  opening_hours_note: string | null;
  photo_path: string | null;
  verified_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SessionMemberRow {
  session_id: UUID;
  user_id: UUID;
  status: MemberStatus;
  position: Position | null;
  requested_at: ISODateTime;
  confirmed_at: ISODateTime | null;
  decided_by: UUID | null;
  updated_at: ISODateTime;
}

export type FailureCode =
  | 'invalid_input'
  | 'invalid_action'
  | 'profile_required'
  | 'start_in_past'
  | 'not_found'
  | 'forbidden'
  | 'session_inactive'
  | 'recruitment_closed'
  | 'session_full'
  | 'request_not_found'
  | 'request_not_pending'
  | 'host_cannot_withdraw'
  | 'not_participating'
  | 'capacity_conflict'
  | 'cannot_block_self'
  | 'not_configured'
  | 'network_error';

export type CommandResult =
  | { ok: false; code: FailureCode; message?: string }
  | {
      ok: true;
      code: string;
      message?: string;
      messageData?: MessageRow | ChatMessage;
      session?: SessionSummary;
      profile?: ProfileRow | UserProfile;
      reportId?: UUID;
    };

export interface AuthService {
  getCurrentUser(): UserProfile | null;
  subscribe(callback: (user: UserProfile | null) => void): () => void;
  signIn(params: { email?: string; password?: string; demoUserId?: UUID }): Promise<{ ok: boolean; error?: string }>;
  signUp?(params: { email: string; password: string; displayName?: string }): Promise<{ ok: boolean; error?: string }>;
  exchangeOidcCode?(code: string): Promise<{ ok: boolean; error?: string; errorCode?: string }>;
  signOut(): Promise<void>;
  switchDemoUser(userId: UUID): Promise<void>;
  listDemoUsers(): UserProfile[];
  isDemoMode: boolean;
  isConfigured: boolean;
}

export interface DataService {
  // Reads
  listCourts(): Promise<Court[]>;
  getProfile(userId?: UUID): Promise<UserProfile | null>;
  listSessions(filter?: FeedFilter): Promise<SessionSummary[]>;
  getSession(sessionId: UUID): Promise<SessionSummary | null>;
  listMySessions(options?: { limit?: number; offset?: number }): Promise<SessionSummary[]>;
  listMembers(sessionId: UUID): Promise<SessionMember[]>;
  listMessages(sessionId: UUID, limit?: number): Promise<ChatMessage[]>;

  // Writes
  saveProfile(input: ProfileInput): Promise<CommandResult>;
  createSession(requestId: UUID, input: SessionInput): Promise<CommandResult>;
  updateSession(sessionId: UUID, patch: Partial<SessionInput>): Promise<CommandResult>;
  joinSession(sessionId: UUID, position?: Position | null): Promise<CommandResult>;
  decideRequest(sessionId: UUID, userId: UUID, approve: boolean): Promise<CommandResult>;
  withdraw(sessionId: UUID): Promise<CommandResult>;
  setRecruitment(sessionId: UUID, open: boolean): Promise<CommandResult>;
  endSession(sessionId: UUID, lifecycle: 'completed' | 'cancelled'): Promise<CommandResult>;
  sendMessage(sessionId: UUID, clientMessageId: UUID, body: string): Promise<CommandResult>;
  blockUser(userId: UUID): Promise<CommandResult>;
  unblockUser(userId: UUID): Promise<CommandResult>;
  report(targetType: 'user' | 'session' | 'message', targetId: UUID, reason: string): Promise<CommandResult>;
}

export interface AppServicesContextValue {
  auth: AuthService;
  data: DataService;
  isDemo: boolean;
  isConfigured: boolean;
  connectedModeType?: 'demo' | 'connected-api' | 'connected-supabase';
  resetDemoState: () => void;
  setUseDemo?: (val: boolean) => void;
}
