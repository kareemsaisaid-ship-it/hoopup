import { test, expect } from '../helpers/leafletFixture';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/qa/screenshots_map4d');
const PILOT_FILE = path.resolve(__dirname, '../../../backend/server/tiles/pilot.pmtiles');

let pilotBuffer: Buffer;
let pilotSize = 0;

/**
 * Fulfills RFC 7233 HTTP Range requests (206 Partial Content) for pilot.pmtiles.
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
    const suffix = parseInt(match[2], 10);
    start = Math.max(0, pilotSize - suffix);
    end = pilotSize - 1;
  } else if (match[1] !== '' && match[2] === '') {
    start = parseInt(match[1], 10);
    end = pilotSize - 1;
  } else {
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

test.describe('HoopUp MAP4d — Map Labels & Bangkok Bounds Integration', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    expect(fs.existsSync(PILOT_FILE)).toBe(true);
    pilotBuffer = fs.readFileSync(PILOT_FILE);
    pilotSize = pilotBuffer.length;
  });

  test('TC-MAP4D-01: Custom label rules render readable text on canvas at z16 around Siam/Chula with bounds set', async ({
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
    // Navigate with MDCU court param
    await page.goto('/courts?view=map&court=20759377-b0da-47eb-a03a-683f483063a8');
    await page.waitForLoadState('networkidle');

    // 1. Verify container and markers exist
    const courtsMap = page.locator('[data-testid="courts-map"]');
    await expect(courtsMap).toBeVisible();

    const canvasTile = page.locator('.leaflet-tile-pane canvas.leaflet-tile');
    await expect(canvasTile.first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);

    // 2. Verify Leaflet map bounds and minZoom are constrained for PMTiles basemap
    const mapConstraints = await page.evaluate(() => {
      const win = window as unknown as {
        __HOOPUP_MAP__?: {
          getMinZoom: () => number;
          options: { maxBounds?: unknown; maxBoundsViscosity?: number };
        };
      };
      const map = win.__HOOPUP_MAP__;
      return {
        hasMap: Boolean(map),
        minZoom: map?.getMinZoom() ?? 0,
        hasMaxBounds: Boolean(map?.options.maxBounds),
        maxBoundsViscosity: map?.options.maxBoundsViscosity ?? 0,
      };
    });

    expect(mapConstraints.hasMap).toBe(true);
    expect(mapConstraints.minZoom).toBeGreaterThanOrEqual(9);
    expect(mapConstraints.hasMaxBounds).toBe(true);
    expect(mapConstraints.maxBoundsViscosity).toBeCloseTo(0.8, 1);

    // 3. Zoom directly to zoom 16 around Siam/Chula area
    await page.evaluate(() => {
      const win = window as unknown as {
        __HOOPUP_MAP__?: {
          setView: (coords: [number, number], zoom: number) => void;
        };
      };
      win.__HOOPUP_MAP__?.setView([13.7380, 100.5340], 16);
    });
    await page.waitForTimeout(1000);

    // 4. Assert via canvas pixels that text labels are drawn:
    // Labels use high-contrast light fill (#F8FAFC / #F1F5F9) on dark basemap (#1F1F1F / #34373D).
    // Inspect count of light pixels in the label color range (r > 200, g > 200, b > 200).
    const pixelStats = await page.evaluate(() => {
      const canvases = Array.from(
        document.querySelectorAll('.leaflet-tile-pane canvas')
      ) as HTMLCanvasElement[];
      let lightPixels = 0;
      let totalSamples = 0;

      for (const canvas of canvases) {
        if (canvas.width === 0 || canvas.height === 0) continue;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        try {
          const img = ctx.getImageData(0, 0, Math.min(canvas.width, 256), Math.min(canvas.height, 256));
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            totalSamples++;
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const a = d[i + 3];
            if (a > 200 && r > 200 && g > 200 && b > 200) {
              lightPixels++;
            }
          }
        } catch {
          // sandbox ignore
        }
      }
      return { lightPixels, totalSamples };
    });

    expect(pixelStats.totalSamples).toBeGreaterThan(0);
    // Baseline dark basemap without labels has ~0 light pixels; with text labels it has hundreds/thousands
    expect(pixelStats.lightPixels).toBeGreaterThan(150);

    // 5. Verify court popup card remains fully visible and clickable above basemap
    const popupName = page.locator('[data-testid="court-popup-name"]');
    await expect(popupName).toBeVisible();
    await expect(popupName).toContainText('MDCU');

    const viewBtn = page.locator('[data-testid="court-popup-view-sessions"]');
    await expect(viewBtn).toBeVisible();

    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('TC-MAP4D-02: Capture AFTER screenshots at z15, z16, z17 for Siam Square, MDCU court, and residential soi', async ({
    page,
  }) => {
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
    await page.goto('/courts?view=map&court=20759377-b0da-47eb-a03a-683f483063a8');
    await page.waitForLoadState('networkidle');

    const canvasTile = page.locator('.leaflet-tile-pane canvas.leaflet-tile');
    await expect(canvasTile.first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const places = [
      {
        name: 'siam_square',
        lat: 13.7445,
        lng: 100.5315,
      },
      {
        name: 'chula_mdcu',
        lat: 13.7351456,
        lng: 100.5368385,
      },
      {
        name: 'residential_soi',
        lat: 13.7486,
        lng: 100.5298,
      },
    ];

    const zooms = [15, 16, 17];

    for (const place of places) {
      for (const z of zooms) {
        await page.evaluate(
          ({ lat, lng, zoom }) => {
            const win = window as unknown as {
              __HOOPUP_MAP__?: {
                setView: (coords: [number, number], zoom: number) => void;
              };
            };
            win.__HOOPUP_MAP__?.setView([lat, lng], zoom);
          },
          { lat: place.lat, lng: place.lng, zoom: z }
        );
        await page.waitForTimeout(1200);

        const shotPath = path.join(SCREENSHOT_DIR, `${place.name}_z${z}_after.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
        expect(fs.existsSync(shotPath)).toBe(true);
      }
    }
  });
});
