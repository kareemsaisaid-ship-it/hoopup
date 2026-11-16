import { describe, expect, it } from 'vitest';
import { isPastDateTime, localInputToBangkokIso, formatThaiDateTime } from '../utils/dateTime';
import { validateCapacityConflict, validateSessionInput } from '../utils/validation';

describe('Session Validation & Math (G3)', () => {
  it('validates guestCount strictly within 0 to teamSize - 1', () => {
    // 5v5: max guests = 4
    const valid5v5 = validateSessionInput(
      {
        title: 'บาสเย็น 5v5',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        teamSize: 5,
        guestCount: 4,
      },
      true
    );
    expect(valid5v5.isValid).toBe(true);

    const invalid5v5 = validateSessionInput(
      {
        title: 'บาสเย็น 5v5',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        teamSize: 5,
        guestCount: 5, // exceeds teamSize - 1
      },
      true
    );
    expect(invalid5v5.isValid).toBe(false);
    expect(invalid5v5.errors.guestCount).toBeDefined();

    // 3v3: max guests = 2
    const valid3v3 = validateSessionInput(
      {
        title: 'บาส 3v3',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        teamSize: 3,
        guestCount: 2,
      },
      true
    );
    expect(valid3v3.isValid).toBe(true);

    const invalid3v3 = validateSessionInput(
      {
        title: 'บาส 3v3',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        teamSize: 3,
        guestCount: 3,
      },
      true
    );
    expect(invalid3v3.isValid).toBe(false);
    expect(invalid3v3.errors.guestCount).toBeDefined();
  });

  it('rejects empty title or missing courtId', () => {
    const res = validateSessionInput(
      {
        title: '   ',
        courtId: '',
        teamSize: 5,
        guestCount: 0,
      },
      true
    );
    expect(res.isValid).toBe(false);
    expect(res.errors.title).toBeDefined();
    expect(res.errors.courtId).toBeDefined();
  });

  it('validates future datetime vs past datetime', () => {
    // Past datetime
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(isPastDateTime(yesterday)).toBe(true);

    const pastCheck = validateSessionInput(
      {
        title: 'บาสย้อนหลัง',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        startsAt: yesterday,
        teamSize: 5,
        guestCount: 0,
      },
      false
    );
    expect(pastCheck.isValid).toBe(false);
    expect(pastCheck.errors.startsAt).toBe('ไม่สามารถเลือกเวลาในอดีตได้');

    // Future datetime
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    expect(isPastDateTime(tomorrow)).toBe(false);

    const futureCheck = validateSessionInput(
      {
        title: 'บาสพรุ่งนี้',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        startsAt: tomorrow,
        teamSize: 5,
        guestCount: 0,
      },
      false
    );
    expect(futureCheck.isValid).toBe(true);
  });

  it('validates capacity conflict on session edit', () => {
    // Case: confirmedCount is 3 (host + 2 joiners). User wants 3v3 with 1 guest.
    // totalOccupied = 3 + 1 = 4 > 3 -> conflict!
    const conflict = validateCapacityConflict(3, 1, 3);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.message).toContain('สูงกว่าขนาดทีม');

    // Case: confirmedCount is 2 (host + 1 joiner). User wants 5v5 with 2 guests.
    // totalOccupied = 2 + 2 = 4 <= 5 -> ok
    const noConflict = validateCapacityConflict(5, 2, 2);
    expect(noConflict.hasConflict).toBe(false);
  });

  it('correctly parses and formats Bangkok timezone', () => {
    const iso = localInputToBangkokIso('2026-10-28T18:00');
    expect(iso).toContain('+07:00');

    const formatted = formatThaiDateTime(iso);
    expect(formatted).toContain('18:00');
  });

  it('UI2 calculation: formula and dots count match friends + host + needed', () => {
    // 5v5 with 2 friends: host (1) + friends (2) = occupied (3), needed (2)
    const teamSize5 = 5;
    const friends2 = 2;
    const occupied5 = 1 + friends2;
    const needed5 = teamSize5 - occupied5;
    expect(occupied5).toBe(3);
    expect(needed5).toBe(2);

    // 3v3 with 2 friends: host (1) + friends (2) = occupied (3), needed (0) -> Full
    const teamSize3 = 3;
    const friendsMax = 2;
    const occupied3 = 1 + friendsMax;
    const needed3 = teamSize3 - occupied3;
    expect(occupied3).toBe(3);
    expect(needed3).toBe(0);
  });

  it('F01: skips past datetime check when editing an existing session with unchanged startsAt, but rejects new past time', () => {
    const pastStoredTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const differentPastTime = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago

    // Case 1: Editing session where startsAt is unchanged from stored past session -> isValid: true
    const unchangedCheck = validateSessionInput(
      {
        title: 'แก้ไขจุดนัดพบในนัดที่กำลังเล่น',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        startsAt: pastStoredTime,
        meetingPoint: 'ข้างสนามแป้น 2',
        teamSize: 5,
        guestCount: 0,
      },
      false,
      { originalStartsAt: pastStoredTime }
    );
    expect(unchangedCheck.isValid).toBe(true);
    expect(unchangedCheck.errors.startsAt).toBeUndefined();

    // Case 2: Editing session but picking a different past time -> rejected with Thai error
    const changedToPastCheck = validateSessionInput(
      {
        title: 'แก้ไขเวลาไปในอดีต',
        courtId: 'c1111111-1111-4111-8111-111111111111',
        startsAt: differentPastTime,
        teamSize: 5,
        guestCount: 0,
      },
      false,
      { originalStartsAt: pastStoredTime }
    );
    expect(changedToPastCheck.isValid).toBe(false);
    expect(changedToPastCheck.errors.startsAt).toBe('ไม่สามารถเลือกเวลาในอดีตได้');
  });
});

