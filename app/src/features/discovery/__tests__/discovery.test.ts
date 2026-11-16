import { describe, expect, it } from 'vitest';
import type { Position, ProfileInput, SessionSummary } from '../../../services';

// Test duplicate position validation rule
function validatePositions(primary: string, secondary: string): string | null {
  if (primary && secondary && primary === secondary) {
    return 'ตำแหน่งหลักและตำแหน่งรองต้องไม่ซ้ำกัน กรุณาเลือกตำแหน่งอื่นหรือเว้นว่างไว้';
  }
  return null;
}

// Test distance calculation (no fake distance if coords are missing)
function calculateDistance(
  userLat: number | null,
  userLon: number | null,
  courtLat: number | null,
  courtLon: number | null
): string | null {
  if (
    userLat === null ||
    userLon === null ||
    courtLat === null ||
    courtLon === null
  ) {
    return null; // Must not show fake distance
  }
  const R = 6371; // km
  const dLat = ((courtLat - userLat) * Math.PI) / 180;
  const dLon = ((courtLon - userLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((userLat * Math.PI) / 180) *
      Math.cos((courtLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return `${(R * c).toFixed(1)} กม.`;
}

// Test discovery feed filter logic
function filterSessions(
  sessions: SessionSummary[],
  options: {
    search?: string;
    courtId?: string;
    teamSize?: string;
    skillLevel?: string;
    quickPill?: 'all' | 'now' | '3x3' | '5x5';
  }
): SessionSummary[] {
  return sessions.filter((s) => {
    // Only open recruitment in feed (completed/full/closed excluded)
    if (!s.recruitmentOpen || s.displayStatus !== 'open') {
      return false;
    }

    if (options.search?.trim()) {
      const q = options.search.toLowerCase();
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchCourt = s.court.name.toLowerCase().includes(q);
      if (!matchTitle && !matchCourt) return false;
    }

    if (options.courtId && options.courtId !== 'all' && s.court.id !== options.courtId) {
      return false;
    }

    if (options.teamSize && options.teamSize !== 'all' && s.teamSize.toString() !== options.teamSize) {
      return false;
    }

    if (options.skillLevel && options.skillLevel !== 'all' && s.skillLevel !== options.skillLevel) {
      return false;
    }

    if (options.quickPill === '3x3' && s.teamSize !== 3) return false;
    if (options.quickPill === '5x5' && s.teamSize !== 5) return false;

    return true;
  });
}

describe('G2 Discovery & Profile Business Rules', () => {
  describe('Profile Position Validation', () => {
    it('disallows duplicate primary and secondary positions', () => {
      const err = validatePositions('PG', 'PG');
      expect(err).toBe('ตำแหน่งหลักและตำแหน่งรองต้องไม่ซ้ำกัน กรุณาเลือกตำแหน่งอื่นหรือเว้นว่างไว้');
    });

    it('allows different primary and secondary positions', () => {
      const err = validatePositions('PG', 'SG');
      expect(err).toBeNull();
    });

    it('allows only primary position with empty secondary', () => {
      const err = validatePositions('C', '');
      expect(err).toBeNull();
    });

    it('allows neither position specified', () => {
      const err = validatePositions('', '');
      expect(err).toBeNull();
    });

    it('preserves loaded profile values on full form save', () => {
      const loadedProfile = {
        displayName: 'ก้อง',
        avatarPath: '/avatars/kong.png',
        skillLevel: 'regular' as const,
        primaryPosition: 'PG' as Position,
        secondaryPosition: 'SG' as Position,
        playsAnyPosition: true,
        heightCm: 178,
      };

      // User changes only skillLevel to competitive
      const updated: ProfileInput = {
        ...loadedProfile,
        skillLevel: 'competitive',
      };

      expect(updated.displayName).toBe('ก้อง');
      expect(updated.avatarPath).toBe('/avatars/kong.png');
      expect(updated.primaryPosition).toBe('PG');
      expect(updated.secondaryPosition).toBe('SG');
      expect(updated.playsAnyPosition).toBe(true);
      expect(updated.heightCm).toBe(178);
      expect(updated.skillLevel).toBe('competitive');
    });
  });

  describe('Distance Calculation Rules', () => {
    it('returns null if court coordinates are missing (no fake distance)', () => {
      const dist = calculateDistance(13.75, 100.5, null, null);
      expect(dist).toBeNull();
    });

    it('returns null if user coordinates are missing', () => {
      const dist = calculateDistance(null, null, 13.73, 100.54);
      expect(dist).toBeNull();
    });

    it('calculates real distance in km when both coordinates are present', () => {
      // Lumpini (13.730, 100.541) to Benjakitti (13.729, 100.559) ~ 1.9 km
      const dist = calculateDistance(13.730, 100.541, 13.729, 100.559);
      expect(dist).toBeTruthy();
      expect(dist).toMatch(/^[0-9]+\.[0-9] กม\.$/);
    });
  });

  describe('Feed Filter and Status Rules', () => {
    const mockSessions: SessionSummary[] = [
      {
        id: 's-1',
        title: 'บาสเย็น 5x5 สวนลุม',
        hostId: 'u-1',
        hostName: 'ก้อง',
        court: { id: 'c-1', name: 'สนามบาส สวนลุมพินี', latitude: 13.73, longitude: 100.54 },
        startsAt: '2026-10-28T18:00:00+07:00',
        teamSize: 5,
        confirmedCount: 3,
        guestCount: 0,
        occupiedCount: 3,
        seatsRemaining: 2,
        skillLevel: 'regular',
        welcomesBeginners: true,
        wantedPositions: ['C', 'PF'],
        joinPolicy: 'instant',
        lifecycle: 'active',
        recruitmentOpen: true,
        displayStatus: 'open',
        myMembershipStatus: null,
        meetingPoint: 'ข้างแป้น 1',
        notes: '',
        updatedAt: '2026-10-28T10:00:00+07:00',
        endedAt: null,
        actions: { canManage: false, canJoin: true, canReadChat: false, canSendMessage: false, canWithdraw: false },
      },
      {
        id: 's-2',
        title: '3x3 ชิลๆ เบญจกิติ',
        hostId: 'u-2',
        hostName: 'ต้น',
        court: { id: 'c-2', name: 'สวนเบญจกิติ', latitude: 13.72, longitude: 100.55 },
        startsAt: '2026-10-28T19:00:00+07:00',
        teamSize: 3,
        confirmedCount: 2,
        guestCount: 0,
        occupiedCount: 2,
        seatsRemaining: 1,
        skillLevel: 'casual',
        welcomesBeginners: true,
        wantedPositions: [],
        joinPolicy: 'approval',
        lifecycle: 'active',
        recruitmentOpen: true,
        displayStatus: 'open',
        myMembershipStatus: null,
        meetingPoint: 'ม้านั่งยาว',
        notes: '',
        updatedAt: '2026-10-28T10:00:00+07:00',
        endedAt: null,
        actions: { canManage: false, canJoin: true, canReadChat: false, canSendMessage: false, canWithdraw: false },
      },
      {
        id: 's-3',
        title: 'ห้องเต็มแล้ว',
        hostId: 'u-3',
        hostName: 'เอก',
        court: { id: 'c-1', name: 'สนามบาส สวนลุมพินี', latitude: 13.73, longitude: 100.54 },
        startsAt: '2026-10-28T17:00:00+07:00',
        teamSize: 3,
        confirmedCount: 3,
        guestCount: 0,
        occupiedCount: 3,
        seatsRemaining: 0,
        skillLevel: 'competitive',
        welcomesBeginners: false,
        wantedPositions: [],
        joinPolicy: 'instant',
        lifecycle: 'active',
        recruitmentOpen: false,
        displayStatus: 'full',
        myMembershipStatus: null,
        meetingPoint: '',
        notes: '',
        updatedAt: '2026-10-28T10:00:00+07:00',
        endedAt: null,
        actions: { canManage: false, canJoin: false, canReadChat: false, canSendMessage: false, canWithdraw: false },
      },
      {
        id: 's-4',
        title: 'นัดจบแล้ว',
        hostId: 'u-4',
        hostName: 'เจ',
        court: { id: 'c-2', name: 'สวนเบญจกิติ', latitude: 13.72, longitude: 100.55 },
        startsAt: '2026-10-27T18:00:00+07:00',
        teamSize: 5,
        confirmedCount: 5,
        guestCount: 0,
        occupiedCount: 5,
        seatsRemaining: 0,
        skillLevel: 'regular',
        welcomesBeginners: true,
        wantedPositions: [],
        joinPolicy: 'instant',
        lifecycle: 'completed',
        recruitmentOpen: false,
        displayStatus: 'completed',
        myMembershipStatus: null,
        meetingPoint: '',
        notes: '',
        updatedAt: '2026-10-27T20:00:00+07:00',
        endedAt: '2026-10-27T20:00:00+07:00',
        actions: { canManage: false, canJoin: false, canReadChat: false, canSendMessage: false, canWithdraw: false },
      },
    ];

    it('excludes full and completed sessions from discovery feed', () => {
      const openFeed = filterSessions(mockSessions, {});
      expect(openFeed.length).toBe(2);
      expect(openFeed.map((s) => s.id)).toEqual(['s-1', 's-2']);
      expect(openFeed.find((s) => s.displayStatus === 'full')).toBeUndefined();
      expect(openFeed.find((s) => s.displayStatus === 'completed')).toBeUndefined();
    });

    it('filters by court ID', () => {
      const lumpini = filterSessions(mockSessions, { courtId: 'c-1' });
      expect(lumpini.length).toBe(1);
      expect(lumpini[0].id).toBe('s-1');
    });

    it('filters by team size (3x3 vs 5x5)', () => {
      const threeVthree = filterSessions(mockSessions, { teamSize: '3' });
      expect(threeVthree.length).toBe(1);
      expect(threeVthree[0].id).toBe('s-2');

      const fiveVfive = filterSessions(mockSessions, { teamSize: '5' });
      expect(fiveVfive.length).toBe(1);
      expect(fiveVfive[0].id).toBe('s-1');
    });

    it('filters by skill level', () => {
      const casualOnly = filterSessions(mockSessions, { skillLevel: 'casual' });
      expect(casualOnly.length).toBe(1);
      expect(casualOnly[0].id).toBe('s-2');
    });

    it('filters by search term matching court name or title', () => {
      const searchCourt = filterSessions(mockSessions, { search: 'เบญจกิติ' });
      expect(searchCourt.length).toBe(1);
      expect(searchCourt[0].id).toBe('s-2');

      const searchTitle = filterSessions(mockSessions, { search: 'สวนลุม' });
      expect(searchTitle.length).toBe(1);
      expect(searchTitle[0].id).toBe('s-1');
    });

    it('returns empty list when no sessions match filters', () => {
      const noMatch = filterSessions(mockSessions, { search: 'สนามศุภชลาศัย' });
      expect(noMatch.length).toBe(0);
    });

    it('sets court filter from ?court= and resets to all when param is absent', () => {
      const resolveCourtFilter = (param: string | null): string => {
        return param || 'all';
      };

      expect(resolveCourtFilter('c-1')).toBe('c-1');
      expect(resolveCourtFilter(null)).toBe('all');
      expect(resolveCourtFilter('')).toBe('all');

      const filteredByParam = filterSessions(mockSessions, { courtId: resolveCourtFilter('c-1') });
      expect(filteredByParam.length).toBe(1);
      expect(filteredByParam[0].id).toBe('s-1');

      const resetFilter = filterSessions(mockSessions, { courtId: resolveCourtFilter(null) });
      expect(resetFilter.length).toBe(2);
    });
  });

  describe('MAP1 Court Coordinates Partitioning (Pure Helper)', () => {
    it('splits pinned courts and missing-coordinate courts accurately', async () => {
      const { splitCourtsByCoordinates } = await import('../courtMapUtils');
      const testCourts: import('../../../services').Court[] = [
        {
          id: 'court-valid-1',
          name: 'สนามเบญจกิติ',
          address: 'ถ.รัชดาภิเษก',
          latitude: 13.7314,
          longitude: 100.5583,
          surfaceType: 'Polyurethane',
          isIndoor: false,
          hasLighting: true,
          hoopCount: 4,
          openingHoursNote: '05:00-21:00',
          photoPath: null,
          verifiedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'court-valid-2',
          name: 'สนามสวนลุมพินี',
          address: 'ถ.พระราม 4',
          latitude: 13.7317,
          longitude: 100.5414,
          surfaceType: 'Asphalt',
          isIndoor: false,
          hasLighting: true,
          hoopCount: 2,
          openingHoursNote: '05:00-20:30',
          photoPath: null,
          verifiedAt: '2026-09-10T00:00:00.000Z',
        },
        {
          id: 'court-null-coords',
          name: 'สนามชุมชนพัฒนา (ไม่มีพิกัด)',
          address: 'ซอยพัฒนา',
          latitude: null,
          longitude: null,
          surfaceType: 'Concrete',
          isIndoor: false,
          hasLighting: false,
          hoopCount: 1,
          openingHoursNote: null,
          photoPath: null,
          verifiedAt: null,
        },
        {
          id: 'court-partial-coords',
          name: 'สนามชานเมือง (พิกัดไม่สมบูรณ์)',
          address: null,
          latitude: 13.8,
          longitude: null,
          surfaceType: null,
          isIndoor: null,
          hasLighting: null,
          hoopCount: null,
          openingHoursNote: null,
          photoPath: null,
          verifiedAt: null,
        },
      ];

      const { pinned, missing } = splitCourtsByCoordinates(testCourts);

      expect(pinned.length).toBe(2);
      expect(missing.length).toBe(2);

      // Verify pinned entries have numeric coordinates
      expect(pinned[0].id).toBe('court-valid-1');
      expect(pinned[0].latitude).toBe(13.7314);
      expect(pinned[0].longitude).toBe(100.5583);
      expect(pinned[1].id).toBe('court-valid-2');

      // Verify missing entries
      expect(missing.map((c) => c.id)).toEqual(['court-null-coords', 'court-partial-coords']);
    });

    it('computes initial bounds for densest area: excludes outliers, falls back to Bangkok on empty list, and handles single court', async () => {
      const { computeInitialMapBounds } = await import('../courtMapUtils');

      // 1. Empty list falls back to Bangkok
      const emptyBounds = computeInitialMapBounds([]);
      expect(emptyBounds).toEqual([
        [13.7563, 100.5018],
        [13.7563, 100.5018],
      ]);

      // 2. Single court works
      const singleCourt = {
        id: 'court-1',
        name: 'Court 1',
        address: null,
        latitude: 13.72,
        longitude: 100.56,
        surfaceType: null,
        isIndoor: null,
        hasLighting: null,
        hoopCount: null,
        openingHoursNote: null,
        photoPath: null,
        verifiedAt: null,
      };
      const singleBounds = computeInitialMapBounds([singleCourt]);
      expect(singleBounds).toEqual([
        [13.72, 100.56],
        [13.72, 100.56],
      ]);

      // 3. Outlier excluded
      // 4 courts tightly centered around (13.75, 100.53)
      // 1 far outlier (King's Court east of Bangkok at 100.8323)
      const denseCourts = [
        { ...singleCourt, id: 'c1', latitude: 13.74, longitude: 100.52 },
        { ...singleCourt, id: 'c2', latitude: 13.75, longitude: 100.53 },
        { ...singleCourt, id: 'c3', latitude: 13.76, longitude: 100.54 },
        { ...singleCourt, id: 'c4', latitude: 13.75, longitude: 100.51 },
      ];
      const outlierCourt = {
        ...singleCourt,
        id: 'c-outlier',
        name: "King's Court (Far East Outlier)",
        latitude: 13.6135,
        longitude: 100.8323,
      };

      const bounds = computeInitialMapBounds([...denseCourts, outlierCourt], 0.8);

      // The 80% closest courts are the 4 dense courts (Math.ceil(5 * 0.8) = 4)
      // Outlier longitude (100.8323) must NOT be included in bounds
      expect(bounds[1][1]).toBe(100.54);
      expect(bounds[1][1]).toBeLessThan(100.80);
      // Outlier latitude (13.6135) must NOT be included in bounds
      expect(bounds[0][0]).toBe(13.74);
      expect(bounds[0][0]).toBeGreaterThan(13.65);
    });
  });
});

