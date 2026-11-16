import type { MapEnv } from './mapConfig';

export const PLACES_MIN_ZOOM = 16;
export const PLACES_LABEL_ZOOM = 17;
export const PLACES_GROUPS = {
  food: { label: 'อาหารและเครื่องดื่ม', color: '#f59e0b', icon: 'restaurant' },
  shop: { label: 'ร้านค้า', color: '#a78bfa', icon: 'convenience' },
  sports: { label: 'กีฬาและฟิตเนส', color: '#22c55e', icon: 'stadium' },
  parking: { label: 'ที่จอดรถ', color: '#60a5fa', icon: '' },
  transport: { label: 'การเดินทาง', color: '#38bdf8', icon: 'train_station' },
  health: { label: 'สุขภาพ', color: '#fb7185', icon: '' },
  education: { label: 'การศึกษา', color: '#facc15', icon: 'school' },
  lodging: { label: 'ที่พัก', color: '#2dd4bf', icon: '' },
} as const;
export type PlaceGroup = keyof typeof PLACES_GROUPS;
export interface Place { i: string; n: string; c: string; g: PlaceGroup; x: number; y: number }
export type PlacesBox = [number, number, number, number];
export const PLACES_CREDIT = 'Places © <a href="https://overturemaps.org/attribution-licensing/" target="_blank" rel="noopener noreferrer">Overture Maps Foundation</a>';

/** Centre-only coverage for unusually wide/tilted viewports; never over 0.05°.
 * Round inward, leaving floating-point headroom at the API boundary. */
export function placesRequestBoxes(bounds: PlacesBox): PlacesBox[] {
  if (!bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return [];
  const [w, s, e, n] = bounds;
  const cx = (w + e) / 2, cy = (s + n) / 2;
  const west = Math.max(w, cx - 0.024999, 100.25), south = Math.max(s, cy - 0.024999, 13.45);
  const east = Math.min(e, cx + 0.024999, 101), north = Math.min(n, cy + 0.024999, 14.15);
  const box: PlacesBox = [Math.ceil(west * 1e5) / 1e5, Math.ceil(south * 1e5) / 1e5,
    Math.floor(east * 1e5) / 1e5, Math.floor(north * 1e5) / 1e5];
  return box[0] < box[2] && box[1] < box[3] ? [box] : [];
}
export function placesCacheKey(box: PlacesBox): string { return box.map(v => v.toFixed(5)).join(','); }

/** Keep map captions short and on one line; the popup retains the full name. */
export function placeCaption(name: string): string {
  const characters = Array.from(name.replace(/[\r\n\t\u2028\u2029]/g, ' '));
  return characters.length > 40 ? `${characters.slice(0, 40).join('')}…` : characters.join('');
}

export function resolvePlacesUrl(env: MapEnv, origin: string): string | null {
  if (env.VITE_PLACES === 'off') return null;
  try {
    const base = env.VITE_MAP_PMTILES_URL?.trim();
    const fallback = base && /^https?:\/\//i.test(base) ? new URL(base).origin : origin;
    const url = new URL(env.VITE_PLACES_API_URL?.trim() || '/places', env.VITE_PLACES_API_URL?.trim() ? origin : fallback);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = ''; return url.href;
  } catch { return null; }
}

export function sanitizePlaces(response: unknown): Place[] {
  if (!response || typeof response !== 'object' || !('places' in response) || !Array.isArray(response.places)) throw new Error('Invalid places response');
  const result: Place[] = [], seen = new Set<string>();
  for (const row of response.places.slice(0, 300)) {
    if (!row || typeof row !== 'object') continue;
    const { i, n, c, g, x, y } = row;
    if (typeof i !== 'string' || !i.trim() || i.length > 256 || seen.has(i)
      || typeof n !== 'string' || !n.trim() || n.length > 256
      || typeof c !== 'string' || !c.trim() || c.length > 128
      || typeof g !== 'string' || !Object.hasOwn(PLACES_GROUPS, g)
      || typeof x !== 'number' || !Number.isFinite(x) || x < 100.25 || x > 101
      || typeof y !== 'number' || !Number.isFinite(y) || y < 13.45 || y > 14.15) continue;
    seen.add(i); result.push({ i, n: n.trim(), c, g: g as PlaceGroup, x, y });
  }
  return result;
}

export function buildPlacePopup(place: Place): HTMLDivElement {
  const card = document.createElement('div'); card.dataset.testid = 'place-popup';
  const name = document.createElement('strong'); name.textContent = place.n;
  const group = document.createElement('div'); group.textContent = PLACES_GROUPS[place.g].label;
  card.append(name, group); return card;
}

export class PlacesCache {
  private entries = new Map<string, { at: number; places: Place[] }>();
  get(key: string, now = Date.now()): Place[] | undefined {
    const entry = this.entries.get(key);
    if (!entry || now - entry.at >= 300_000) { this.entries.delete(key); return; }
    return entry.places;
  }
  set(key: string, places: Place[], now = Date.now()) {
    this.entries.delete(key); this.entries.set(key, { at: now, places });
    if (this.entries.size > 24) this.entries.delete(this.entries.keys().next().value!);
  }
}
