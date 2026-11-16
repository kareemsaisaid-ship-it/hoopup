/** Proposed v0.1 RPC contract. No live Supabase endpoint has been deployed. */
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
  /** null or omitted = use server clock for "ตอนนี้". Otherwise an ISO future instant. */
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
  court: {id: UUID; name: string; latitude: number | null; longitude: number | null};
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

/** Rows returned for these objects currently use SQL snake_case. */
export interface MessageRow {
  id: UUID;
  session_id: UUID;
  sender_id: UUID;
  client_message_id: UUID;
  body: string;
  created_at: ISODateTime;
}

export interface ProfileInput {
  displayName: string;
  avatarPath?: string | null;
  skillLevel?: SkillLevel;
  primaryPosition?: Position | null;
  secondaryPosition?: Position | null;
  playsAnyPosition?: boolean;
  heightCm?: number | null;
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
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type FailureCode = 'invalid_input' | 'invalid_action' | 'profile_required' | 'start_in_past'
  | 'not_found' | 'forbidden' | 'session_inactive' | 'recruitment_closed' | 'session_full'
  | 'request_not_found' | 'request_not_pending' | 'host_cannot_withdraw' | 'not_participating'
  | 'capacity_conflict' | 'cannot_block_self';

export type CommandResult =
  | {ok: false; code: FailureCode}
  | {ok: true; code: string; session?: SessionSummary; message?: MessageRow;
      profile?: ProfileRow; reportId?: UUID};

/** Mapping to the parameter objects accepted by supabase.rpc(name, params). */
export interface RpcContract {
  hoopup_save_profile: {args: {p_input: ProfileInput}; result: CommandResult};
  hoopup_create_session: {args: {p_request_id: UUID; p_input: SessionInput}; result: CommandResult};
  hoopup_get_session: {args: {p_session_id: UUID}; result: SessionSummary | null};
  hoopup_list_sessions: {args: {p_filter?: FeedFilter}; result: SessionSummary[]};
  hoopup_my_sessions: {args: {p_limit?: number; p_offset?: number}; result: SessionSummary[]};
  hoopup_join_session: {args: {p_session_id: UUID; p_position?: Position | null}; result: CommandResult};
  hoopup_decide_request: {args: {p_session_id: UUID; p_user_id: UUID; p_approve: boolean}; result: CommandResult};
  hoopup_withdraw: {args: {p_session_id: UUID}; result: CommandResult};
  hoopup_update_session: {args: {p_session_id: UUID; p_patch: Partial<SessionInput>}; result: CommandResult};
  hoopup_set_recruitment: {args: {p_session_id: UUID; p_open: boolean}; result: CommandResult};
  hoopup_end_session: {args: {p_session_id: UUID; p_lifecycle: 'completed' | 'cancelled'}; result: CommandResult};
  hoopup_send_message: {args: {p_session_id: UUID; p_client_message_id: UUID; p_body: string}; result: CommandResult};
  hoopup_block_user: {args: {p_user_id: UUID}; result: CommandResult};
  hoopup_unblock_user: {args: {p_user_id: UUID}; result: CommandResult};
  hoopup_report: {args: {p_target_type: 'user' | 'session' | 'message'; p_target_id: UUID; p_reason: string}; result: CommandResult};
}
