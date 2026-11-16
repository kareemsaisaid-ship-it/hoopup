#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const OUT_DIR = path.join(ROOT_DIR, 'data', 'osm');
const RAW_FILE = path.join(OUT_DIR, 'overpass_raw_bangkok.json');
const QUERY_FILE = path.join(OUT_DIR, 'overpass_query.txt');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Bangkok metro bounding box: south 13.50, west 100.30, north 14.00, east 100.95
const QUERY = `[out:json][timeout:60];
(
  nwr["sport"="basketball"](13.50,100.30,14.00,100.95);
);
out center tags;`;

async function fetchFromEndpoint(endpoint, query) {
  console.log(`Connecting to Overpass endpoint: ${endpoint}...`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'User-Agent': 'HoopUp-Court-Fetcher/1.0 (https://github.com/hoopup)',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.elements)) {
      throw new Error('Response did not contain expected elements array');
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  const fetchedAt = new Date().toISOString();
  let rawData = null;
  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    try {
      rawData = await fetchFromEndpoint(endpoint, QUERY);
      console.log(`Successfully fetched from ${endpoint}`);
      break;
    } catch (err) {
      console.warn(`Endpoint ${endpoint} failed: ${err.message}`);
      lastError = err;
    }
  }

  if (!rawData) {
    console.error('All Overpass endpoints failed.');
    throw lastError || new Error('Failed to query Overpass API');
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // Attach fetchedAt timestamp to raw JSON payload
  const payloadToSave = {
    ...rawData,
    fetchedAt,
  };

  fs.writeFileSync(RAW_FILE, JSON.stringify(payloadToSave, null, 2), 'utf-8');
  console.log(`Saved RAW response (${rawData.elements.length} elements) to ${RAW_FILE}`);

  fs.writeFileSync(QUERY_FILE, QUERY, 'utf-8');
  console.log(`Saved exact query to ${QUERY_FILE}`);
}

main().catch((err) => {
  console.error('Fetch OSM courts failed:', err);
  process.exit(1);
});
