import { getErrorMessage } from './errors';
import type {
  ChatMessage,
  CommandResult,
  Court,
  CourtRow,
  FailureCode,
  MessageRow,
  ProfileRow,
  SessionSummary,
  UserProfile,
  UUID,
} from './types';

/**
 * Normalizes snake_case ProfileRow (from Supabase/backend) or camelCase UserProfile to standard app UserProfile.
 */
export function mapProfileRowToUserProfile(row: ProfileRow | UserProfile): UserProfile {
  if ('display_name' in row) {
    const pr = row as ProfileRow;
    return {
      id: pr.id,
      displayName: pr.display_name,
      avatarPath: pr.avatar_path,
      skillLevel: pr.skill_level,
      primaryPosition: pr.primary_position,
      secondaryPosition: pr.secondary_position,
      playsAnyPosition: pr.plays_any_position,
      heightCm: pr.height_cm,
      heightVisible: Boolean(pr.height_visible),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    };
  }
  return row as UserProfile;
}

/**
 * Maps backend CommandResult (which has message?: MessageRow object) to app CommandResult
 * (which expects message?: string and messageData?: MessageRow | ChatMessage).
 * Also normalizes profile if present.
 */
export function mapBackendCommandResult(raw: unknown): CommandResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'network_error', message: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้' };
  }

  const data = raw as Record<string, unknown>;

  if (data.ok === false) {
    const code = (data.code as FailureCode) || 'invalid_action';
    const message = typeof data.message === 'string' ? data.message : getErrorMessage(code);
    return {
      ok: false,
      code,
      message,
    };
  }

  let messageData: MessageRow | ChatMessage | undefined;
  let humanMessage: string | undefined;

  // If backend returns `message` as an object (MessageRow), map to messageData
  if (data.message && typeof data.message === 'object') {
    messageData = data.message as MessageRow;
    humanMessage = getErrorMessage(data.code as string);
  } else if (typeof data.message === 'string') {
    humanMessage = data.message;
  } else if (data.code) {
    humanMessage = getErrorMessage(data.code as string);
  }

  if (data.messageData && typeof data.messageData === 'object') {
    messageData = data.messageData as MessageRow | ChatMessage;
  }

  let profile: UserProfile | undefined;
  if (data.profile && typeof data.profile === 'object') {
    profile = mapProfileRowToUserProfile(data.profile as ProfileRow | UserProfile);
  }

  return {
    ok: true,
    code: (data.code as string) || 'success',
    message: humanMessage,
    messageData,
    session: data.session as SessionSummary | undefined,
    profile,
    reportId: data.reportId as UUID | undefined,
  };
}

/**
 * Normalizes snake_case CourtRow to camelCase Court.
 */
export function mapCourtRowToCourt(r: CourtRow): Court {
  return {
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
  };
}
