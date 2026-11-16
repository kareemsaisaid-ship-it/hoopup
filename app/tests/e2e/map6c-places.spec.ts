import { test, expect, type Page, type TestInfo } from '../helpers/glFixture';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });
const pilot = readFileSync(path.resolve('../backend/server/tiles/pilot.pmtiles'));
const hostile = '<img src=x onerror=window.__injected=true> ร้านไทย';
const center = { lat: 13.732, lng: 100.5425 };
type Probe = { calls: number; aborted: number; active: number; maxActive: number; maxPerBox: number };
type ProbeWindow = Window & { __placesProbe: Probe; __injected?: boolean };

async function setup(page: Page, config: Record<string, string> = {}) {
  const errors: string[] = [], expectedHttpErrors: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (/Failed to load resource: the server responded with a status of (429|503)/.test(message.text())) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  page.on('request', request => { if (new URL(request.url()).pathname === '/places') requests.push(request.url()); });
  await page.addInitScript(config => {
    Object.assign(window, { __HOOPUP_CONFIG__: { VITE_MAP_ENGINE: 'maplibre', VITE_MAP_PMTILES_URL: '/tiles/pilot.pmtiles', VITE_PLACES_API_URL: '/places', ...config } });
    const win = window as ProbeWindow;
    win.__placesProbe = { calls: 0, aborted: 0, active: 0, maxActive: 0, maxPerBox: 0 };
    const nativeFetch = window.fetch.bind(window), perBox = new Map<string, number>();
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.origin);
      if (url.pathname !== '/places') return nativeFetch(input, init);
      const probe = win.__placesProbe, key = url.searchParams.get('bbox')!;
      probe.calls++; probe.active++; perBox.set(key, (perBox.get(key) || 0) + 1);
      probe.maxActive = Math.max(probe.maxActive, probe.active); probe.maxPerBox = Math.max(probe.maxPerBox, perBox.get(key)!);
      init?.signal?.addEventListener('abort', () => probe.aborted++, { once: true });
      try { return await nativeFetch(input, init); }
      finally { probe.active--; perBox.set(key, perBox.get(key)! - 1); }
    };
  }, config);
  await page.route('**/tiles/pilot.pmtiles', async route => {
    const range = route.request().headers().range, match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), pilot.length - 1) : pilot.length - 1;
    const body = pilot.subarray(start, end + 1);
    await route.fulfill({ status: range ? 206 : 200, headers: {
      'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': String(body.length),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${pilot.length}` } : {}),
    }, body });
  });
  return { errors, expectedHttpErrors, requests };
}
async function ready(page: Page) {
  await page.goto('/courts?view=map', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-ready', 'true');
}
async function view(page: Page, zoom: number, lng = center.lng) {
  await page.evaluate(({ zoom, lng, lat }) => window.__HOOPUP_MAP__!.setView(lat, lng, zoom), { zoom, lng, lat: center.lat });
}
async function probe(page: Page) { return page.evaluate(() => ({ ...(window as ProbeWindow).__placesProbe })); }
async function record(page: Page, info: TestInfo, evidence: Awaited<ReturnType<typeof setup>>) {
  await info.attach('places-request-counts', { body: JSON.stringify({ ...await probe(page), requests: evidence.requests, expectedHttpErrors: evidence.expectedHttpErrors }), contentType: 'application/json' });
  console.log(`MAP6C ${info.project.name} ${info.title}: ${JSON.stringify(await probe(page))}; expected HTTP console errors=${evidence.expectedHttpErrors.length}`);
  expect(evidence.errors).toEqual([]);
  for (const request of evidence.requests) {
    const url = new URL(request); expect(url.origin).toBe(new URL(page.url()).origin);
    expect(url.searchParams.get('limit')).toBe('300');
    const [w, s, e, n] = url.searchParams.get('bbox')!.split(',').map(Number);
    expect(e - w).toBeLessThanOrEqual(0.05); expect(n - s).toBeLessThanOrEqual(0.05);
    expect(w).toBeGreaterThanOrEqual(100.25); expect(e).toBeLessThanOrEqual(101);
    expect(s).toBeGreaterThanOrEqual(13.45); expect(n).toBeLessThanOrEqual(14.15);
  }
}
async function goodRoute(page: Page) {
  await page.route('**/places?**', route => route.fulfill({ json: { places: [
    { i: 'safe', n: hostile, c: 'parking', g: 'parking', x: center.lng, y: center.lat },
    { i: 'sprite', n: 'อาหารไทย', c: 'restaurant', g: 'food', x: center.lng + 0.0006, y: center.lat + 0.0003 },
    { i: 'bad', n: '<script>bad()</script>', c: 'food', g: 'unknown', x: center.lng, y: center.lat },
    { i: 'bad2', n: 'bad', c: 'food', g: 'food', x: '100.54', y: null },
  ], total: 4, truncated: false } }));
}

test('MAP6D drawn places survive pan and a pending replacement, then new data replaces them', async ({ page }, info) => {
  const evidence = await setup(page); await goodRoute(page); await ready(page);
  await view(page, 16);
  const map = page.getByTestId('courts-map');
  await expect(map).toHaveAttribute('data-place-count', '2');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/places?**', async route => {
    await pending;
    await route.fulfill({ json: { places: [], total: 0, truncated: false } });
  });
  await view(page, 16, center.lng + 0.001);
  expect(await map.getAttribute('data-place-count')).toBe('2');
  await expect.poll(() => evidence.requests.length).toBe(2);
  await expect(map).toHaveAttribute('data-place-count', '2');
  release();
  await expect(map).toHaveAttribute('data-place-count', '0');
  await record(page, info, evidence);
});

test('MAP6C zoom gate, toggle, bounded requests, cache, safe native popup and court targets', async ({ page }, info) => {
  const evidence = await setup(page); await goodRoute(page); await ready(page);
  await page.waitForTimeout(650); expect(evidence.requests).toHaveLength(0);
  await view(page, 16); await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '2');
  expect(evidence.requests).toHaveLength(1);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Places © Overture Maps Foundation');
  await expect(page.locator('.maplibregl-ctrl-attrib a[href="https://overturemaps.org/attribution-licensing/"]')).toBeVisible();
  await page.getByTestId('courts-places').click();
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '0');
  await expect(page.locator('.maplibregl-ctrl-attrib')).not.toContainText('Overture');
  await view(page, 17); await page.waitForTimeout(650); expect(evidence.requests).toHaveLength(1);
  await page.getByTestId('courts-places').click(); await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '2');
  expect(evidence.requests).toHaveLength(2);
  await page.getByTestId('courts-map').scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  const canvas = page.locator('.maplibregl-canvas'), box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('place-popup')).toContainText(hostile);
  await expect(page.getByTestId('place-popup')).toContainText('ที่จอดรถ');
  await expect(page.getByTestId('place-popup').locator('img,script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as ProbeWindow).__injected)).toBeUndefined();
  await page.setViewportSize({ width: 360, height: 800 }); await view(page, 17);
  // Retained places are visible before replacement data arrives. Let this
  // deterministic fixture finish the 300 ms viewport debounce before moving.
  await page.waitForTimeout(650);
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '2');
  mkdirSync('docs/qa/screenshots_map6c', { recursive: true });
  await page.screenshot({ path: `docs/qa/screenshots_map6c/places-z17-${info.project.name.replace(/\W/g, '_')}-360x800.png` });
  await view(page, 16); await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '2');
  await page.waitForTimeout(650);
  const beforeBack = evidence.requests.length;
  await view(page, 16, center.lng + 0.004); await expect.poll(() => evidence.requests.length).toBe(beforeBack + 1);
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '0');
  await view(page, 16); await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '2');
  expect(evidence.requests).toHaveLength(beforeBack + 1);
  await page.evaluate(() => window.__HOOPUP_MAP__!.setView(13.7317, 100.5414, 18));
  const pin = page.locator('[data-court-id="c2222222-2222-4222-8222-222222222222"]');
  await expect(pin).toBeVisible(); const pinBox = (await pin.boundingBox())!;
  expect(pinBox.width).toBeGreaterThanOrEqual(44); expect(pinBox.height).toBeGreaterThanOrEqual(44);
  await pin.click(); await expect(page.getByTestId('court-popup-name')).toContainText('ลุมพินี');
  await view(page, 15); await page.waitForTimeout(650);
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '0');
  await record(page, info, evidence);
});

for (const code of [503, 429]) test(`MAP6C ${code} is a quiet status and map remains usable`, async ({ page }, info) => {
  const evidence = await setup(page);
  await page.route('**/places?**', route => route.fulfill({ status: code, json: { error: 'temporary' } }));
  await ready(page); await view(page, 16);
  await expect(page.getByTestId('courts-places-status')).toHaveText('ข้อมูลสถานที่ใกล้เคียงใช้ไม่ได้ชั่วคราว');
  await expect(page.getByTestId('courts-places-status')).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('courts-map-error')).toHaveCount(0);
  await page.evaluate(() => window.__HOOPUP_MAP__!.setView(13.7317, 100.5414, 18));
  await page.locator('[data-court-id="c2222222-2222-4222-8222-222222222222"]').click();
  await expect(page.getByTestId('court-popup-name')).toContainText('ลุมพินี');
  await page.getByTestId('courts-places').click(); await expect(page.getByTestId('courts-places-status')).toHaveCount(0);
  await record(page, info, evidence);
});

test('MAP6C fast panning aborts obsolete work with at most one request per box; unmount aborts', async ({ page }, info) => {
  const evidence = await setup(page); const releases: (() => void)[] = [];
  await page.route('**/places?**', async route => {
    await new Promise<void>(resolve => releases.push(resolve));
    await route.fulfill({ json: { places: [], total: 0, truncated: false } }).catch(() => {});
  });
  await ready(page); await view(page, 16);
  await expect.poll(async () => (await probe(page)).calls).toBe(1);
  await view(page, 16, center.lng + 0.002); await view(page, 16, center.lng + 0.003); await view(page, 16, center.lng + 0.004);
  await expect.poll(async () => (await probe(page)).calls).toBe(2);
  await expect.poll(async () => (await probe(page)).aborted).toBe(1);
  await view(page, 16); await expect.poll(async () => (await probe(page)).calls).toBe(3);
  await page.getByTestId('courts-view-list').click();
  await expect.poll(async () => (await probe(page)).aborted).toBe(3);
  const counts = await probe(page); expect(counts.maxPerBox).toBe(1); expect(counts.maxActive).toBe(1);
  releases.forEach(release => release()); await record(page, info, evidence);
});

test('MAP6C places off runtime switch prevents requests and credit', async ({ page }, info) => {
  const evidence = await setup(page);
  await page.addInitScript(() => localStorage.setItem('VITE_PLACES', 'off'));
  await goodRoute(page); await ready(page); await view(page, 18);
  await page.waitForTimeout(650); expect(evidence.requests).toHaveLength(0);
  await expect(page.getByTestId('courts-places')).toHaveCount(0);
  await expect(page.locator('.maplibregl-ctrl-attrib')).not.toContainText('Overture');
  await record(page, info, evidence);
});

test('MAP6C 300 dense places use native layers, local glyphs, and retain court pins at zoom 16 and 17', async ({ page }, info) => {
  const evidence = await setup(page); const glyphs: string[] = [];
  page.on('request', r => { if (r.url().includes('/fonts/')) glyphs.push(r.url()); });
  const groups = ['food', 'shop', 'sports', 'parking', 'transport', 'health', 'education', 'lodging'];
  await page.route('**/places?**', route => route.fulfill({ json: {
    places: Array.from({ length: 300 }, (_, i) => ({ i: `dense-${i}`, n: `สถานที่ไทย ${i}`, c: 'fixture', g: groups[i % groups.length],
      x: center.lng + ((i % 20) - 10) * 0.00008, y: center.lat + (Math.floor(i / 20) - 7) * 0.00008 })), total: 900, truncated: true,
  } }));
  await page.setViewportSize({ width: 360, height: 800 }); await ready(page);
  for (const zoom of [16, 17]) {
    await view(page, zoom); await expect(page.getByTestId('courts-map')).toHaveAttribute('data-place-count', '300');
    await page.waitForTimeout(700);
    expect(await page.locator('.maplibregl-marker').count()).toBeLessThanOrEqual(151);
    await page.locator('.maplibregl-ctrl-attrib').scrollIntoViewIfNeeded();
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Places © Overture Maps Foundation');
    await expect(page.locator('.maplibregl-ctrl-attrib a[href="https://www.openstreetmap.org/copyright"]')).toBeVisible();
    await expect(page.locator('.maplibregl-ctrl-attrib a[href="https://protomaps.com"]')).toBeVisible();
    mkdirSync('docs/qa/screenshots_map6c', { recursive: true });
    await page.screenshot({ path: `docs/qa/screenshots_map6c/dense-z${zoom}-${info.project.name.replace(/\W/g, '_')}-360x800.png` });
  }
  expect(glyphs.length).toBeGreaterThan(0);
  expect(glyphs.every(url => url.startsWith(new URL('/map-assets/fonts/', page.url()).href))).toBe(true);
  await record(page, info, evidence);
});
