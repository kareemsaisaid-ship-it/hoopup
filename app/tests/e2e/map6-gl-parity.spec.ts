import { test, expect, type Page } from '../helpers/glFixture';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });
const lumpini = 'c2222222-2222-4222-8222-222222222222';
const pilot = readFileSync(path.resolve('../backend/server/tiles/pilot.pmtiles'));
const shots = 'docs/qa/screenshots_map6a';
type Adapter = { setView: (lat: number, lng: number, zoom: number) => void; getZoom: () => number; getCenter: () => { lat: number; lng: number } };
declare global { interface Window { __HOOPUP_MAP__?: Adapter; __gpsCalls?: number } }

async function setup(page: Page, config: Record<string, string> = {}) {
  await page.addInitScript(config => {
    // Keep MAP6a's basemap/worker/network baseline independent of the optional
    // places service. MAP6c exercises that service, including expected aborts.
    Object.assign(window, { __HOOPUP_CONFIG__: { VITE_MAP_ENGINE: 'maplibre', VITE_MAP_PMTILES_URL: '/tiles/pilot.pmtiles', VITE_PLACES: 'off', ...config } });
    window.__gpsCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: PositionCallback) => {
      window.__gpsCalls!++; ok({ coords: { latitude: 13.7466, longitude: 100.5348 } } as GeolocationPosition);
    } } });
  }, config);
  await page.route('**/tiles/pilot.pmtiles', async route => {
    const range = route.request().headers().range;
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), pilot.length - 1) : pilot.length - 1;
    const body = pilot.subarray(start, end + 1);
    await route.fulfill({ status: range ? 206 : 200, headers: {
      'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes',
      'Content-Length': String(body.length), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${pilot.length}` } : {}),
    }, body });
  });
}
async function ready(page: Page, court?: string) {
  await page.goto(`/courts?view=map${court ? `&court=${court}` : ''}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-pin-total', '151');
}
async function setView(page: Page, lat: number, lng: number, zoom: number) {
  await page.evaluate(({ lat, lng, zoom }) => window.__HOOPUP_MAP__!.setView(lat, lng, zoom), { lat, lng, zoom });
}

for (const flavor of ['dark', 'light']) test(`MAP6 ${flavor}: real WebGL pixels, deep link, attribution, 3D and north reset, no failed requests`, async ({ page }, info) => {
  const errors: string[] = []; const failures: string[] = []; const external: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('requestfailed', r => failures.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  page.on('request', r => { if (/^https?:/.test(r.url()) && !/^http:\/\/(localhost|127\.0\.0\.1):/.test(r.url())) external.push(r.url()); });
  await setup(page, { VITE_MAP_PMTILES_FLAVOR: flavor, VITE_MAP_PRESERVE_BUFFER: 'on' }); await page.setViewportSize({ width: 360, height: 800 });
  await ready(page, lumpini); await expect(page.getByTestId('courts-map')).toHaveAttribute('data-idle', 'true');
  await expect(page.getByTestId('court-popup-name')).toContainText('ลุมพินี');
  const center = await page.evaluate(() => window.__HOOPUP_MAP__!.getCenter());
  expect(center.lat).toBeCloseTo(13.7317, 2); expect(center.lng).toBeCloseTo(100.5414, 2);
  await expect(page.locator('.maplibregl-ctrl-attrib a[href="https://protomaps.com"]').first()).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-attrib a[href="https://www.openstreetmap.org/copyright"]').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('MAP6: WebGL2 unavailable; software rendering must work, no skip permitted');
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 64) if (pixels[i + 3]) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return colors.size;
  })).toBeGreaterThan(15);
  await expect(page.getByTestId('courts-map-error')).toHaveCount(0);
  await expect(page.getByTestId('courts-buildings')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('courts-buildings').click();
  await expect(page.getByTestId('courts-buildings')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('ความสูงจากข้อมูลแผนที่ หรือ 8 ม.')).toBeVisible();
  await expect.poll(async () => Number(await page.getByTestId('courts-map').getAttribute('data-pitch'))).toBeGreaterThan(50);
  await page.getByTestId('courts-north-up').click();
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-pitch', '0');
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-bearing', '0');
  await page.getByTestId('courts-buildings').click();
  await page.getByTestId('courts-map').scrollIntoViewIfNeeded();
  mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${flavor}-${info.project.name.replace(/\W/g, '_')}-360x800.png` });
  expect(errors).toEqual([]); expect(failures).toEqual([]); expect(external).toEqual([]);
});

test('MAP6 native clusters expand; all pins survive filtering and map instance stays stable', async ({ page }) => {
  await setup(page); await ready(page);
  const cluster = page.getByTestId('court-cluster').first(); await expect(cluster).toBeVisible();
  expect(Number(await cluster.getAttribute('data-cluster-count'))).toBeGreaterThan(1);
  const zoom = await page.evaluate(() => window.__HOOPUP_MAP__!.getZoom());
  await cluster.click(); await expect.poll(() => page.evaluate(() => window.__HOOPUP_MAP__!.getZoom())).toBeGreaterThan(zoom);
  await page.evaluate(() => Object.assign(window, { __mapBeforeFilter: window.__HOOPUP_MAP__ }));
  await page.locator('input[placeholder*="ค้นหาชื่อสนาม"]').fill('สวนเบญจกิติ');
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-pin-total', '1');
  expect(await page.evaluate(() => window.__HOOPUP_MAP__ === (window as unknown as { __mapBeforeFilter: unknown }).__mapBeforeFilter)).toBe(true);
  await page.locator('input[placeholder*="ค้นหาชื่อสนาม"]').fill('');
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-pin-total', '151');
});

for (const action of ['view', 'create']) test(`MAP6 popup ${action} action navigates with 44px targets and court prefill`, async ({ page }) => {
  await setup(page); await ready(page, lumpini);
  for (const id of ['court-popup-view-sessions', 'court-popup-create-session']) {
    const box = await page.getByTestId(id).boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  if (action === 'view') {
    await page.getByTestId('court-popup-view-sessions').click(); await expect(page).toHaveURL(new RegExp(`/\\?court=${lumpini}`));
  } else {
    await page.getByTestId('court-popup-create-session').click();
    await expect(page).toHaveURL(new RegExp(`/sessions/new\\?court=${lumpini}`));
    await expect(page.locator('select').filter({ has: page.locator(`option[value="${lumpini}"]`) })).toHaveValue(lumpini);
  }
});

test('MAP6 GPS only on click, user marker survives remount and adapter is cleaned', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    Object.assign(window, { __mapWorkers: 0 });
    window.Worker = class extends NativeWorker {
      tracked: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); this.tracked = String(url).includes('maplibre-gl-worker');
        if (this.tracked) (window as unknown as { __mapWorkers: number }).__mapWorkers++;
      }
      terminate() {
        if (this.tracked) { (window as unknown as { __mapWorkers: number }).__mapWorkers--; this.tracked = false; }
        super.terminate();
      }
    };
  });
  await setup(page); await ready(page); expect(await page.evaluate(() => window.__gpsCalls)).toBe(0);
  expect(await page.evaluate(() => Object.keys(window.__HOOPUP_MAP__!).sort())).toEqual(['getCenter', 'getZoom', 'setView']);
  expect(await page.evaluate(() => (window as unknown as { __mapWorkers: number }).__mapWorkers)).toBe(2);
  await page.getByTestId('courts-locate').click(); await expect(page.getByTestId('user-location-pin')).toBeVisible();
  expect(await page.evaluate(() => window.__gpsCalls)).toBe(1);
  await page.getByTestId('courts-view-list').click();
  expect(await page.evaluate(() => window.__HOOPUP_MAP__)).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as { __mapWorkers: number }).__mapWorkers)).toBe(0);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByTestId('courts-view-map').click();
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('courts-locate').click(); await expect(page.getByTestId('user-location-pin')).toBeVisible();
  expect(await page.evaluate(() => window.__gpsCalls)).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { __mapWorkers: number }).__mapWorkers)).toBe(2);
});

test('MAP6 localStorage flag works and one-finger touch scrolls the page without panning', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173' });
  try {
    const page = await context.newPage();
    await setup(page, { VITE_MAP_TILES: 'off' });
    await page.addInitScript(() => {
      delete (window as unknown as { __HOOPUP_CONFIG__: Record<string, string> }).__HOOPUP_CONFIG__.VITE_MAP_ENGINE;
      localStorage.setItem('VITE_MAP_ENGINE', 'maplibre');
    });
    await ready(page);
    const center = await page.evaluate(() => window.__HOOPUP_MAP__!.getCenter());
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 640 }] });
    for (let y = 620; y >= 400; y -= 20) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
      await page.waitForTimeout(25);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(80);
    const after = await page.evaluate(() => window.__HOOPUP_MAP__!.getCenter());
    expect(after.lat).toBeCloseTo(center.lat, 4); expect(after.lng).toBeCloseTo(center.lng, 4);
  } finally { await context.close(); }
});

test('MAP6 GPS denial text and dismissal', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_ok: unknown, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) } }));
  await ready(page); await page.getByTestId('courts-locate').click();
  await expect(page.getByTestId('courts-locate-error')).toContainText('การเข้าถึงตำแหน่งถูกปฏิเสธ');
  await page.getByTestId('courts-locate-error-close').click(); await expect(page.getByTestId('courts-locate-error')).toHaveCount(0);
});

test('MAP6 bounds lock and min zoom; accessible real source pin opens OSM provenance', async ({ page }) => {
  await setup(page); await ready(page); await setView(page, 48.85, 2.35, 5);
  const center = await page.evaluate(() => window.__HOOPUP_MAP__!.getCenter());
  expect(center.lat).toBeGreaterThanOrEqual(13.45); expect(center.lat).toBeLessThanOrEqual(14.15);
  expect(center.lng).toBeGreaterThanOrEqual(100.25); expect(center.lng).toBeLessThanOrEqual(101);
  expect(await page.evaluate(() => window.__HOOPUP_MAP__!.getZoom())).toBeGreaterThanOrEqual(9);
  const courts = JSON.parse(readFileSync('src/data/osmCourtsBangkok.json', 'utf8'));
  const court = courts.find((c: { osmQuality: string; latitude: number; longitude: number }) => c.osmQuality === 'unverified' && c.latitude > 13.7 && c.latitude < 13.8 && c.longitude > 100.5 && c.longitude < 100.6);
  await setView(page, court.latitude, court.longitude, 18);
  const pin = page.getByRole('button', { name: court.name || `สนามบาสเกตบอล (OSM ${court.osmType} ${court.osmId})`, exact: true });
  await expect(pin).toHaveAttribute('data-court-id', /^[0-9a-f-]{36}$/);
  await expect(pin).toBeVisible(); await pin.click();
  await expect(page.getByTestId('court-popup-osm-badge')).toHaveText('ข้อมูลจาก OSM ยังไม่ยืนยัน');
  const positive = courts.find((c: { osmQuality: string }) => c.osmQuality === 'positive');
  await setView(page, positive.latitude, positive.longitude, 18);
  await page.getByRole('button', { name: positive.name || `สนามบาสเกตบอล (OSM ${positive.osmType} ${positive.osmId})`, exact: true }).click();
  await expect(page.getByTestId('court-popup-osm-badge')).toHaveText('เปิดสาธารณะตามข้อมูล OSM');
});

test('MAP6 popup treats hostile data as text and keeps both button destinations', async ({ page }) => {
  await setup(page, { VITE_MAP_TILES: 'off' }); await ready(page);
  const result = await page.evaluate(async url => {
    const { buildCourtPopup } = await import(url);
    const destinations: string[] = [];
    const card: HTMLElement = buildCourtPopup({ id: 'id / ?&', name: '<img src=x onerror=alert(1)>', address: '<script>bad()</script>', osmQuality: 'positive' }, (path: string) => destinations.push(path));
    card.querySelectorAll('button').forEach(b => b.click());
    return { text: card.textContent, injected: card.querySelectorAll('img,script').length, destinations };
  }, '/src/features/discovery/mapGLUtils.ts');
  expect(result.injected).toBe(0); expect(result.text).toContain('<img src=x onerror=alert(1)>');
  expect(result.destinations).toEqual(['/?court=id%20%2F%20%3F%26', '/sessions/new?court=id%20%2F%20%3F%26']);
});

for (const config of [{ VITE_MAP_PMTILES_URL: '' }, { VITE_MAP_TILES: 'off' }]) test(`MAP6 plain background ${JSON.stringify(config)} has pins and no tile/CDN requests`, async ({ page }) => {
  const tiles: string[] = [];
  page.on('request', r => { if (/\.pmtiles|tile.openstreetmap|\/sprites\//.test(r.url())) tiles.push(r.url()); });
  await setup(page, config); await ready(page); await expect(page.getByTestId('court-cluster').first()).toBeVisible();
  expect(tiles).toEqual([]);
});
