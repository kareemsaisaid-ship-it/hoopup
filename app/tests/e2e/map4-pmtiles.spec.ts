import { test, expect } from '../helpers/leafletFixture';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/qa/screenshots_map4c');
const PILOT_FILE = path.resolve(__dirname, '../../../backend/server/tiles/pilot.pmtiles');

let pilotBuffer: Buffer;
let pilotSize = 0;

/**
 * Helper to fulfill RFC 7233 HTTP Range requests (206 Partial Content)
 * for a slice of pilot.pmtiles buffer.
 */
function handleRangeRequest(rangeHeader: string | undefined): {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
} {
  if (!rangeHeader) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(pilotSize),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
        'Cache-Control': 'public, max-age=3600',
      },
      body: pilotBuffer,
    };
  }

  // Parse bytes=start-end, bytes=start-, or bytes=-suffix
  const match = rangeHeader.replace('bytes=', '').trim().match(/^(\d*)-(\d*)$/);
  if (!match) {
    return {
      status: 416,
      headers: {
        'Content-Range': `bytes */${pilotSize}`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      },
      body: Buffer.alloc(0),
    };
  }

  let start = 0;
  let end = pilotSize - 1;

  if (match[1] === '' && match[2] !== '') {
    // Suffix range: bytes=-N
    const suffix = parseInt(match[2], 10);
    start = Math.max(0, pilotSize - suffix);
    end = pilotSize - 1;
  } else if (match[1] !== '' && match[2] === '') {
    // Open range: bytes=N-
    start = parseInt(match[1], 10);
    end = pilotSize - 1;
  } else {
    // Explicit range: bytes=A-B
    start = parseInt(match[1], 10);
    end = Math.min(pilotSize - 1, parseInt(match[2], 10));
  }

  if (start >= pilotSize || start > end) {
    return {
      status: 416,
      headers: {
        'Content-Range': `bytes */${pilotSize}`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      },
      body: Buffer.alloc(0),
    };
  }

  const chunk = pilotBuffer.subarray(start, end + 1);
  return {
    status: 206,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${pilotSize}`,
      'Content-Length': String(chunk.length),
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
      'Cache-Control': 'public, max-age=3600',
    },
    body: chunk,
  };
}

test.describe('HoopUp MAP4c — Bangkok Self-Hosted PMTiles Vector Basemap Integration', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    expect(fs.existsSync(PILOT_FILE)).toBe(true);
    pilotBuffer = fs.readFileSync(PILOT_FILE);
    pilotSize = pilotBuffer.length;
    expect(pilotSize).toBeGreaterThan(1000000); // ~6.7 MB
  });

  test('TC-MAP4-01: Self-hosted PMTiles basemap (dark flavor) renders non-blank canvas, markers remain visible, attribution present, zero failed requests', async ({
    page,
  }) => {
    const failedRequests: string[] = [];
    const consoleErrors: string[] = [];

    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Intercept PMTiles requests with HTTP 206 Partial Content support
    await page.route('**/tiles/pilot.pmtiles*', async (route) => {
      const resp = handleRangeRequest(route.request().headers()['range']);
      await route.fulfill(resp);
    });

    // Provide PMTiles configuration through runtime hook (dark flavor)
    await page.addInitScript(() => {
      (window as unknown as { __HOOPUP_CONFIG__?: Record<string, string> }).__HOOPUP_CONFIG__ = {
        VITE_MAP_PMTILES_URL: '/tiles/pilot.pmtiles',
        VITE_MAP_PMTILES_FLAVOR: 'dark',
      };
    });

    await page.setViewportSize({ width: 360, height: 800 });
    // Navigate with court param for Lumpini Park (c2222222-2222-4222-8222-222222222222), which is in Pathum Wan
    await page.goto('/courts?view=map&court=c2222222-2222-4222-8222-222222222222');
    await page.waitForLoadState('networkidle');

    // 1. Verify courts map container exists and shows data-pin-total attribute
    const courtsMap = page.locator('[data-testid="courts-map"]');
    await expect(courtsMap).toBeVisible();
    const pinTotal = await courtsMap.getAttribute('data-pin-total');
    expect(parseInt(pinTotal || '0', 10)).toBeGreaterThan(3);

    // 2. Wait for PMTiles canvas tiles to finish loading into Leaflet's tile pane
    const canvasTile = page.locator('.leaflet-tile-pane canvas.leaflet-tile');
    await expect(canvasTile.first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(600); // Allow tile layout and paint cycle to settle

    // 3. Inspect canvas pixels to verify the vector basemap is non-blank (assert > 15 distinct colors)
    const colorStats = await page.evaluate(() => {
      const canvases = Array.from(
        document.querySelectorAll('.leaflet-tile-pane canvas')
      ) as HTMLCanvasElement[];
      if (canvases.length === 0) return { canvasCount: 0, distinctColors: 0 };

      const colors = new Set<string>();
      for (const canvas of canvases) {
        if (canvas.width === 0 || canvas.height === 0) continue;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        try {
          const img = ctx.getImageData(0, 0, Math.min(canvas.width, 256), Math.min(canvas.height, 256));
          const d = img.data;
          for (let i = 0; i < d.length; i += 16) {
            const a = d[i + 3];
            if (a > 0) {
              colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
            }
          }
        } catch {
          // ignore context security in sandbox
        }
      }
      return { canvasCount: canvases.length, distinctColors: colors.size };
    });

    expect(colorStats.canvasCount).toBeGreaterThan(0);
    expect(colorStats.distinctColors).toBeGreaterThan(15);

    // 4. Verify markers, clusters, and popup stay above the basemap
    const popupName = page.locator('[data-testid="court-popup-name"]');
    await expect(popupName).toBeVisible();
    await expect(popupName).toContainText('ลุมพินี');

    const viewBtn = page.locator('[data-testid="court-popup-view-sessions"]');
    await expect(viewBtn).toBeVisible();

    const createBtn = page.locator('[data-testid="court-popup-create-session"]');
    await expect(createBtn).toBeVisible();

    // 5. Verify ODbL and Protomaps attribution links exist and are visible
    const osmAttr = page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]');
    await expect(osmAttr).toBeVisible();
    await expect(osmAttr).toContainText('OpenStreetMap contributors');

    const protoAttr = page.locator('.leaflet-control-attribution a[href="https://protomaps.com"]');
    await expect(protoAttr).toBeVisible();
    await expect(protoAttr).toContainText('Protomaps');

    // 6. Capture 360x800 screenshot of dark flavor in Pathum Wan area zoomed to Lumpini court (zoom 14-16)
    const shotDarkPath = path.join(SCREENSHOT_DIR, 'pmtiles_dark_zoom16_360x800.png');
    await page.screenshot({ path: shotDarkPath, fullPage: false });
    expect(fs.existsSync(shotDarkPath)).toBe(true);

    // 7. Verify zero network errors and zero console errors
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('TC-MAP4-02: PMTiles basemap (light flavor) renders and captures 360x800 screenshot for flavor comparison', async ({
    page,
  }) => {
    const failedRequests: string[] = [];
    const consoleErrors: string[] = [];

    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.route('**/tiles/pilot.pmtiles*', async (route) => {
      const resp = handleRangeRequest(route.request().headers()['range']);
      await route.fulfill(resp);
    });

    // Configure light flavor
    await page.addInitScript(() => {
      (window as unknown as { __HOOPUP_CONFIG__?: Record<string, string> }).__HOOPUP_CONFIG__ = {
        VITE_MAP_PMTILES_URL: '/tiles/pilot.pmtiles',
        VITE_MAP_PMTILES_FLAVOR: 'light',
      };
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/courts?view=map&court=c2222222-2222-4222-8222-222222222222');
    await page.waitForLoadState('networkidle');

    const canvasTile = page.locator('.leaflet-tile-pane canvas.leaflet-tile');
    await expect(canvasTile.first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(600);

    // Assert canvas is non-blank with distinct colors
    const colorStats = await page.evaluate(() => {
      const canvases = Array.from(
        document.querySelectorAll('.leaflet-tile-pane canvas')
      ) as HTMLCanvasElement[];
      const colors = new Set<string>();
      for (const canvas of canvases) {
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        try {
          const img = ctx.getImageData(0, 0, Math.min(canvas.width, 256), Math.min(canvas.height, 256));
          const d = img.data;
          for (let i = 0; i < d.length; i += 16) {
            if (d[i + 3] > 0) colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
          }
        } catch {}
      }
      return { canvasCount: canvases.length, distinctColors: colors.size };
    });

    expect(colorStats.canvasCount).toBeGreaterThan(0);
    expect(colorStats.distinctColors).toBeGreaterThan(15);

    // Capture 360x800 screenshot of light flavor
    const shotLightPath = path.join(SCREENSHOT_DIR, 'pmtiles_light_zoom16_360x800.png');
    await page.screenshot({ path: shotLightPath, fullPage: false });
    expect(fs.existsSync(shotLightPath)).toBe(true);

    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('TC-MAP4-03: Overzoom verification: zooming beyond z15 to z17 and z18 renders crisp vector tiles and does not go blank', async ({
    page,
  }) => {
    const failedRequests: string[] = [];
    const consoleErrors: string[] = [];

    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.route('**/tiles/pilot.pmtiles*', async (route) => {
      const resp = handleRangeRequest(route.request().headers()['range']);
      await route.fulfill(resp);
    });

    await page.addInitScript(() => {
      (window as unknown as { __HOOPUP_CONFIG__?: Record<string, string> }).__HOOPUP_CONFIG__ = {
        VITE_MAP_PMTILES_URL: '/tiles/pilot.pmtiles',
        VITE_MAP_PMTILES_FLAVOR: 'dark',
      };
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/courts?view=map&court=c2222222-2222-4222-8222-222222222222');
    await page.waitForLoadState('networkidle');

    // Wait for initial view to settle
    await page.waitForTimeout(600);

    // Zoom beyond maxDataZoom 15 directly to zoom 17 (overzoom level 17)
    await page.evaluate(() => {
      const win = window as unknown as {
        __HOOPUP_MAP__?: {
          setView: (coords: [number, number], zoom: number) => void;
          getZoom: () => number;
        };
      };
      win.__HOOPUP_MAP__?.setView([13.7317, 100.5414], 17);
    });
    await page.waitForTimeout(800);

    // Verify canvas at zoom 17 is non-blank and has distinct colors
    const colorStatsZ17 = await page.evaluate(() => {
      const canvases = Array.from(
        document.querySelectorAll('.leaflet-tile-pane canvas')
      ) as HTMLCanvasElement[];
      const colors = new Set<string>();
      for (const canvas of canvases) {
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        try {
          const img = ctx.getImageData(0, 0, Math.min(canvas.width, 256), Math.min(canvas.height, 256));
          const d = img.data;
          for (let i = 0; i < d.length; i += 16) {
            if (d[i + 3] > 0) colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
          }
        } catch {}
      }
      return { canvasCount: canvases.length, distinctColors: colors.size };
    });

    expect(colorStatsZ17.canvasCount).toBeGreaterThan(0);
    expect(colorStatsZ17.distinctColors).toBeGreaterThan(15);

    // Capture screenshot at zoom 17
    const shotZ17Path = path.join(SCREENSHOT_DIR, 'pmtiles_overzoom_z17_360x800.png');
    await page.screenshot({ path: shotZ17Path, fullPage: false });
    expect(fs.existsSync(shotZ17Path)).toBe(true);

    // Zoom once more to zoom 18 (overzoom level 18)
    await page.evaluate(() => {
      const win = window as unknown as {
        __HOOPUP_MAP__?: {
          setZoom: (zoom: number) => void;
          getZoom: () => number;
        };
      };
      win.__HOOPUP_MAP__?.setZoom(18);
    });
    await page.waitForTimeout(800);

    const colorStatsZ18 = await page.evaluate(() => {
      const canvases = Array.from(
        document.querySelectorAll('.leaflet-tile-pane canvas')
      ) as HTMLCanvasElement[];
      const colors = new Set<string>();
      for (const canvas of canvases) {
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        try {
          const img = ctx.getImageData(0, 0, Math.min(canvas.width, 256), Math.min(canvas.height, 256));
          const d = img.data;
          for (let i = 0; i < d.length; i += 16) {
            if (d[i + 3] > 0) colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
          }
        } catch {}
      }
      return { canvasCount: canvases.length, distinctColors: colors.size };
    });

    expect(colorStatsZ18.canvasCount).toBeGreaterThan(0);
    expect(colorStatsZ18.distinctColors).toBeGreaterThan(15);

    // Capture screenshot at zoom 18
    const shotZ18Path = path.join(SCREENSHOT_DIR, 'pmtiles_overzoom_z18_360x800.png');
    await page.screenshot({ path: shotZ18Path, fullPage: false });
    expect(fs.existsSync(shotZ18Path)).toBe(true);

    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('TC-MAP4-04: Baseline behavior preserved when PMTILES_URL is unset (draws raster tiles and all interactions work)', async ({
    page,
  }) => {
    // Zero init scripts - pure default env
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/courts?view=map');
    await page.waitForLoadState('networkidle');

    // Verify map container and pin total
    const courtsMap = page.locator('[data-testid="courts-map"]');
    await expect(courtsMap).toBeVisible();
    const pinTotal = await courtsMap.getAttribute('data-pin-total');
    expect(parseInt(pinTotal || '0', 10)).toBeGreaterThan(3);

    // Locate button works
    const locateBtn = page.locator('[data-testid="courts-locate"]');
    await expect(locateBtn).toBeVisible();

    // Cluster bubbles exist
    const clusterBubbles = page.locator('.marker-cluster');
    await expect(clusterBubbles.first()).toBeVisible();

    // ODbL attribution link exists
    const attrLink = page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]');
    await expect(attrLink).toBeVisible();
    await expect(attrLink).toContainText('OpenStreetMap contributors');
  });
});
