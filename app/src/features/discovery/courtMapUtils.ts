import type { Court } from '../../services';
import { BANGKOK_FALLBACK_CENTER } from './mapConfig';

export interface PinnedCourt extends Court {
  latitude: number;
  longitude: number;
}

export interface SplitCourtsResult {
  pinned: PinnedCourt[];
  missing: Court[];
}

export type MapBoundsTuple = [[number, number], [number, number]];

/**
 * Pure helper function to partition a list of courts into:
 * - pinned: courts with valid, non-null numeric latitude and longitude
 * - missing: courts where latitude or longitude is null, undefined, or NaN
 */
export function splitCourtsByCoordinates(courts: Court[]): SplitCourtsResult {
  const pinned: PinnedCourt[] = [];
  const missing: Court[] = [];

  for (const court of courts) {
    if (
      court.latitude !== null &&
      court.latitude !== undefined &&
      typeof court.latitude === 'number' &&
      !isNaN(court.latitude) &&
      court.longitude !== null &&
      court.longitude !== undefined &&
      typeof court.longitude === 'number' &&
      !isNaN(court.longitude)
    ) {
      pinned.push(court as PinnedCourt);
    } else {
      missing.push(court);
    }
  }

  return { pinned, missing };
}

/**
 * Pure helper to compute initial map bounds around the densest court area.
 * Fits the courts closest to the median center (default 80%) so far outliers
 * (such as King's Court east of Bangkok) do not widen the initial zoom.
 *
 * Edge cases:
 * - Empty list: falls back to Bangkok center bounds.
 * - Single court: returns bounds enclosing that single court.
 */
export function computeInitialMapBounds(
  courts: PinnedCourt[],
  ratio: number = 0.8
): MapBoundsTuple {
  if (courts.length === 0) {
    return [
      [BANGKOK_FALLBACK_CENTER[0], BANGKOK_FALLBACK_CENTER[1]],
      [BANGKOK_FALLBACK_CENTER[0], BANGKOK_FALLBACK_CENTER[1]],
    ];
  }

  if (courts.length === 1) {
    const c = courts[0];
    return [
      [c.latitude, c.longitude],
      [c.latitude, c.longitude],
    ];
  }

  const sortedLats = [...courts].map((c) => c.latitude).sort((a, b) => a - b);
  const sortedLngs = [...courts].map((c) => c.longitude).sort((a, b) => a - b);
  const medianLat = sortedLats[Math.floor(sortedLats.length / 2)];
  const medianLng = sortedLngs[Math.floor(sortedLngs.length / 2)];

  const courtsWithDist = courts.map((c) => {
    const dLat = c.latitude - medianLat;
    const dLng = c.longitude - medianLng;
    return {
      court: c,
      distSq: dLat * dLat + dLng * dLng,
    };
  });

  courtsWithDist.sort((a, b) => a.distSq - b.distSq);

  const boundedRatio = Math.min(1, Math.max(0, ratio));
  const count = Math.max(1, Math.ceil(courts.length * boundedRatio));
  const denseCourts = courtsWithDist.slice(0, count).map((item) => item.court);

  const lats = denseCourts.map((c) => c.latitude);
  const lngs = denseCourts.map((c) => c.longitude);

  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

