import { describe, expect, it } from 'vitest';
import { mapBackendCommandResult, mapProfileRowToUserProfile } from '../supabaseAdapter';
import type { MessageRow, ProfileRow, UserProfile } from '../types';

describe('Contract Naming and Profile Shape Mappers (Item 4 & 5)', () => {
  it('maps backend message object to messageData and human text to message', () => {
    const backendMessage: MessageRow = {
      id: 'm-12345678-1234-4234-8234-1234567890ab',
      session_id: 's-12345678-1234-4234-8234-1234567890ab',
      sender_id: 'u-12345678-1234-4234-8234-1234567890ab',
      client_message_id: 'c-12345678-1234-4234-8234-1234567890ab',
      body: 'เจอกันที่คอร์ต 1 นะครับ',
      created_at: '2026-11-01T12:00:00.000Z',
    };

    // Backend shape: CommandResult where message is MessageRow object
    const backendPayload = {
      ok: true,
      code: 'message_sent',
      message: backendMessage,
    };

    const mapped = mapBackendCommandResult(backendPayload);

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) throw new Error('Expected mapped.ok to be true');
    expect(mapped.code).toBe('message_sent');
    // Human-facing message string
    expect(typeof mapped.message).toBe('string');
    // Backend message object is mapped to messageData
    expect(mapped.messageData).toEqual(backendMessage);
  });

  it('normalizes snake_case ProfileRow to camelCase UserProfile', () => {
    const snakeProfile: ProfileRow = {
      id: 'p-12345678-1234-4234-8234-1234567890ab',
      display_name: 'ก้อง ชู้ตเตอร์',
      avatar_path: '/avatars/kong.png',
      skill_level: 'competitive',
      primary_position: 'PG',
      secondary_position: 'SG',
      plays_any_position: false,
      height_cm: 182,
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T11:00:00.000Z',
    };

    const normalized = mapProfileRowToUserProfile(snakeProfile);

    expect(normalized.id).toBe(snakeProfile.id);
    expect(normalized.displayName).toBe('ก้อง ชู้ตเตอร์');
    expect(normalized.avatarPath).toBe('/avatars/kong.png');
    expect(normalized.skillLevel).toBe('competitive');
    expect(normalized.primaryPosition).toBe('PG');
    expect(normalized.secondaryPosition).toBe('SG');
    expect(normalized.playsAnyPosition).toBe(false);
    expect(normalized.heightCm).toBe(182);
    expect(normalized.createdAt).toBe('2026-11-01T10:00:00.000Z');
    expect(normalized.updatedAt).toBe('2026-11-01T11:00:00.000Z');

    // Confirm no snake_case fields remain on normalized object
    expect((normalized as any).display_name).toBeUndefined();
    expect((normalized as any).avatar_path).toBeUndefined();
    expect((normalized as any).skill_level).toBeUndefined();
  });

  it('preserves existing camelCase UserProfile when passed to mapProfileRowToUserProfile', () => {
    const camelProfile: UserProfile = {
      id: 'p-999',
      displayName: 'บอย มือแม่น',
      avatarPath: null,
      skillLevel: 'casual',
      primaryPosition: 'C',
      secondaryPosition: null,
      playsAnyPosition: true,
      heightCm: 195,
      heightVisible: false,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    };

    const result = mapProfileRowToUserProfile(camelProfile);
    expect(result).toEqual(camelProfile);
  });

  it('normalizes backend save_profile RPC payload through mapBackendCommandResult', () => {
    const backendSaveResult = {
      ok: true,
      code: 'profile_saved',
      profile: {
        id: 'p-12345',
        display_name: 'ต้าร์ รีบาวด์',
        avatar_path: null,
        skill_level: 'regular',
        primary_position: 'PF',
        secondary_position: 'C',
        plays_any_position: false,
        height_cm: 190,
        created_at: '2026-11-01T08:00:00.000Z',
        updated_at: '2026-11-01T09:00:00.000Z',
      },
    };

    const mapped = mapBackendCommandResult(backendSaveResult);

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) throw new Error('Expected mapped.ok to be true');
    expect(mapped.profile).toBeDefined();
    const profile = mapped.profile as UserProfile;
    expect(profile.displayName).toBe('ต้าร์ รีบาวด์');
    expect(profile.skillLevel).toBe('regular');
    expect((profile as any).display_name).toBeUndefined();
  });

  it('maps backend failure result with human-readable error message', () => {
    const backendFailure = {
      ok: false,
      code: 'capacity_conflict',
    };

    const mapped = mapBackendCommandResult(backendFailure);

    expect(mapped.ok).toBe(false);
    expect(mapped.code).toBe('capacity_conflict');
    expect(mapped.message).toBe('จำนวนคนใหม่ขัดแย้งกับสมาชิกที่มีอยู่แล้ว');
  });

  it('maps height_visible boolean correctly in both directions (HT2)', () => {
    // 1. Opted-in profile row (height_visible: true)
    const visibleRow: ProfileRow = {
      id: 'p-vis',
      display_name: 'ก้อง ชู้ตเตอร์',
      avatar_path: null,
      skill_level: 'regular',
      primary_position: 'PG',
      secondary_position: null,
      plays_any_position: false,
      height_cm: 180,
      height_visible: true,
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
    };
    const visibleProfile = mapProfileRowToUserProfile(visibleRow);
    expect(visibleProfile.heightCm).toBe(180);
    expect(visibleProfile.heightVisible).toBe(true);

    // 2. Hidden profile row (height_visible: false)
    const hiddenRow: ProfileRow = {
      id: 'p-hid',
      display_name: 'บอย มือแม่น',
      avatar_path: null,
      skill_level: 'casual',
      primary_position: 'SF',
      secondary_position: null,
      plays_any_position: true,
      height_cm: 185,
      height_visible: false,
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
    };
    const hiddenProfile = mapProfileRowToUserProfile(hiddenRow);
    expect(hiddenProfile.heightCm).toBe(185);
    expect(hiddenProfile.heightVisible).toBe(false);

    // 3. Absent/null height_visible (e.g. from /profiles/:userId when viewing another user)
    const absentRow: ProfileRow = {
      id: 'p-abs',
      display_name: 'คนอื่น',
      avatar_path: null,
      skill_level: 'casual',
      primary_position: null,
      secondary_position: null,
      plays_any_position: true,
      height_cm: null,
      height_visible: null,
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
    };
    const absentProfile = mapProfileRowToUserProfile(absentRow);
    expect(absentProfile.heightCm).toBeNull();
    expect(absentProfile.heightVisible).toBe(false);
  });
});
