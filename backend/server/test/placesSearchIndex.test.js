import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { PlacesSearchIndex, nameBigrams, normalizeSearchText, registerPlacesSearchRoutes } from '../src/routes/placesSearch.js';
import { getCategoryGroup } from '../src/routes/places.js';

const realFile = fileURLToPath(new URL('../data/places-bangkok.ndjson', import.meta.url));
const groups = ['food', 'shop', 'sports', 'parking', 'transport', 'health', 'education', 'lodging'];
const queryCount = 3200;
function seededRandom(seed = 0x5a17c0de) {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
}

function makeQueries(names, count = queryCount) {
  const random = seededRandom();
  const thai = names.filter(n => /\p{Script=Thai}/u.test(n) && Array.from(n).length >= 8);
  const latin = names.filter(n => /[a-z]/i.test(n) && Array.from(n).length >= 8);
  assert.ok(thai.length && latin.length, 'Real-name query pools must include Thai and Latin');
  const queries = new Set(['เซเว่น', 'bts', 'สยาม', 'ร้านกาแฟ', 'SIAM', 'siam paragon', 'Siam / Square',
    '  BTS   Siam  ', 'Nice Ka\u0308ffee', 'cafe\u0301', 'zzzzqqqq_no_match_987654',
    'aa', 'aaaaaa', 'กก', 'กกกกกก', '!!', '😀😀']);
  let attempt = 0;
  while (queries.size < count) {
    const pool = attempt % 2 ? thai : latin;
    const name = Array.from(pool[Math.floor(random() * pool.length)]);
    const length = 2 + attempt % 7;
    const start = Math.floor(random() * (name.length - length + 1));
    let q = name.slice(start, start + length).join('').trim();
    if (attempt % 11 === 0) q = q.toUpperCase();
    if (attempt % 13 === 0) q = q.normalize('NFD');
    if (Array.from(q).length >= 2 && !/[\x00-\x1f\x7f]/.test(q)) queries.add(q);
    assert.ok(++attempt < count * 100, 'Query generation must terminate');
  }
  return [...queries];
}

function modes(i) {
  const catsSet = new Set([groups[i % groups.length], groups[(i + 1) % groups.length]]);
  const near = i % 2 ? [100.534, 13.746] : [100.72, 13.64];
  const limit = 1 + i % 20;
  return [{ limit }, { limit, near }, { limit, catsSet }, { limit, near, catsSet }];
}

function compareQuery(index, q, i) {
  for (const options of modes(i)) {
    const input = { q, ...options };
    assert.deepEqual(index.search(input), index.linearSearch(input), `Full response mismatch: ${JSON.stringify({ q, ...options, catsSet: options.catsSet && [...options.catsSet] })}`);
  }
}

function sampleIndex() {
  // Read real names, but keep the normal regression test fast with a fixed sample.
  // The standalone benchmark below repeats equivalence on the entire real corpus.
  const lines = fs.readFileSync(realFile, 'utf8').trim().split('\n');
  const random = seededRandom(0x531c2026), selected = new Set();
  while (selected.size < Math.min(2048, lines.length)) selected.add(Math.floor(random() * lines.length));
  const real = [...selected].sort((a, b) => a - b).map(i => JSON.parse(lines[i]));
  const edgeNames = ['a', '😀', 'X😀Y', 'aaaaaa', 'กกกก', 'Siam / Square', 'Nice Käffee', 'café sample',
    'BTS:สยาม', 'bca ab', 'Siam-Square', 'Siam.Square', 'Siam,Square', 'Siam(Square', 'Siam;Square',
    'Siam[Square', 'Siam{Square', ' SIAM   Square ', 'identical tie', 'identical tie'];
  const edges = edgeNames.map((n, i) => ({ i: i >= 18 ? 'duplicate-id' : `edge-${i}`, n,
    c: i % 2 ? 'restaurant' : 'shopping_mall', x: 100.534 + i * 0.00001, y: 13.746, f: 0.9 }));
  const index = new PlacesSearchIndex('<fixed-real-name-sample>');
  index.places = [...real, ...edges].map(p => ({ ...p, g: getCategoryGroup(p.c) || 'other' }));
  index.normNames = index.places.map(p => normalizeSearchText(p.n));
  index.buildBigramIndex();
  return { index, realNames: real.map(p => p.n), realCount: real.length };
}

function quantiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) };
}

async function benchmark() {
  assert.ok(global.gc, 'Run the benchmark with node --expose-gc');
  global.gc();
  const memoryBeforeLoad = process.memoryUsage(), started = performance.now();
  const index = new PlacesSearchIndex(realFile);
  await index.load({ info() {} });
  const initialLoadMs = performance.now() - started;
  const initialBigramBuild = index.bigramBuildStats;
  const memoryAfterLoad = process.memoryUsage();
  index.bigramPostings = null;
  global.gc();
  const memoryBeforeBigrams = process.memoryUsage();
  index.buildBigramIndex();
  const rebuiltBigramStats = index.bigramBuildStats;
  global.gc();
  const memoryAfterBigrams = process.memoryUsage();
  const app = Fastify({ logger: false });
  registerPlacesSearchRoutes(app, { placesSearchIndex: index, placesSearchRateLimitMax: 100000 });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const indexed = PlacesSearchIndex.prototype.search.bind(index), linear = index.linearSearch.bind(index);
  const queryPools = [index.normNames.filter(n => /\p{Script=Thai}/u.test(n) && Array.from(n).length >= 6),
    index.normNames.filter(n => /[a-z]/.test(n) && Array.from(n).length >= 6)];
  const random = seededRandom(0x300236), timing = [];
  let requests = 0;
  const request = async (q, search) => {
    index.search = search;
    const t = performance.now();
    const res = await fetch(`${base}/places/search?${new URLSearchParams({ q, near: '100.534,13.746', limit: '10' })}`);
    const body = await res.json();
    const elapsed = performance.now() - t;
    assert.equal(res.status, 200); requests++;
    return { elapsed, body };
  };
  try {
    // Warm both matchers and the loopback HTTP connection outside timed samples.
    for (let i = 0; i < 20; i++) {
      await request('siam', linear); await request('siam', indexed);
    }
    for (const length of [2, 3, 6]) {
      const samples = { linear: [], indexed: [] }, candidates = [];
      const queries = [];
      while (queries.length < 300) {
        const pool = queryPools[queries.length % 2];
        const chars = Array.from(pool[Math.floor(random() * pool.length)]);
        const start = Math.floor(random() * (chars.length - length + 1));
        const q = chars.slice(start, start + length).join('');
        if (q === q.trim() && !/[\x00-\x1f\x7f]/.test(q)) queries.push(q);
      }
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        const order = i % 2 ? [['indexed', indexed], ['linear', linear]] : [['linear', linear], ['indexed', indexed]];
        const responses = [];
        for (const [name, search] of order) {
          const result = await request(q, search); samples[name].push(result.elapsed); responses.push(result.body);
        }
        assert.deepEqual(responses[0], responses[1]);
        candidates.push(index.searchCandidates(normalizeSearchText(q))?.length ?? index.places.length);
      }
      timing.push({ codePoints: length, requestsPerMatcher: 300, linearMs: quantiles(samples.linear), indexedMs: quantiles(samples.indexed), candidates: quantiles(candidates), queries });
      console.log(`HTTP benchmark complete: ${length} code points, 300 requests per matcher`);
    }
  } finally { index.search = indexed; await app.close(); }
  const queries = makeQueries(index.places.map(p => p.n));
  const eqStart = performance.now();
  for (let i = 0; i < queries.length; i++) {
    compareQuery(index, queries[i], i);
    if ((i + 1) % 400 === 0) {
      console.log(`Full-corpus equivalence: ${i + 1}/${queries.length} queries, ${(i + 1) * 4} responses, 0 mismatches`);
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  const summary = { node: process.version, platform: process.platform, arch: process.arch,
    file: realFile, fileBytes: fs.statSync(realFile).size, records: index.places.length,
    initialLoadMs, initialBigramBuild, memoryBeforeLoad, memoryAfterLoad,
    rebuiltBigramStats, memoryBeforeBigrams, memoryAfterBigrams,
    extraHeapMiB: (memoryAfterBigrams.heapUsed - memoryBeforeBigrams.heapUsed) / 1048576,
    extraArrayBuffersMiB: (memoryAfterBigrams.arrayBuffers - memoryBeforeBigrams.arrayBuffers) / 1048576,
    timing, measuredRequests: 1800, warmupRequests: requests - 1800,
    fullEquivalence: { queries: queries.length, comparisons: queries.length * 4, mismatches: 0, durationMs: performance.now() - eqStart } };
  const output = process.argv.find(arg => arg.startsWith('--output='));
  if (output) fs.writeFileSync(path.resolve(output.slice('--output='.length)), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, timing: timing.map(({ queries, ...rest }) => rest) }, null, 2));
}

if (process.argv.includes('--benchmark')) {
  await benchmark();
} else {
  test('SRCH2 typed code-point postings are unique, ordered, literal, and fall back for one code point or lone surrogates', () => {
    const { index } = sampleIndex();
    assert.deepEqual([...nameBigrams('ab')], ['ab']);
    assert.deepEqual([...nameBigrams('😀😀a')], ['😀😀', '😀a']);
    assert.deepEqual([...nameBigrams('aaaa')], ['aa']);
    assert.ok(nameBigrams('a b').has('a '));
    for (const list of index.bigramPostings.values()) {
      assert.ok(list instanceof Uint32Array);
      for (let i = 1; i < list.length; i++) assert.ok(list[i] > list[i - 1]);
    }
    for (const q of ['a', '😀', '😀y', 'x😀', '\ude00y', 'x\ud83d', '', 'identical', 'a / b', 'aaa', 'bca ab', 'square', 'cafe\u0301']) compareQuery(index, q, 0);
    assert.equal(index.searchCandidates('😀'), null);
    assert.ok(index.search({ q: '😀' }).places.some(p => p.n === '😀'));
    assert.ok(index.search({ q: '😀y' }).places.some(p => p.n === 'X😀Y'));
    assert.equal(index.searchCandidates(normalizeSearchText('a\u0308')), null);
    assert.equal(index.searchCandidates('\ude00y'), null);
    assert.ok(index.searchCandidates('zzzz_not_in_sample').length < index.places.length);
    assert.deepEqual(index.search({ q: 'zzzz_not_in_sample' }), { places: [], total: 0, truncated: false });
  });

  test('SRCH2 deterministic equivalence: 3200 distinct real-name/edge queries × four near/cats modes, full responses identical', t => {
    const start = performance.now();
    const { index, realNames, realCount } = sampleIndex();
    const queries = makeQueries(realNames);
    assert.equal(queries.length, queryCount); assert.equal(new Set(queries).size, queryCount);
    for (let i = 0; i < queries.length; i++) compareQuery(index, queries[i], i);
    t.diagnostic(JSON.stringify({ seed: '0x5a17c0de', realRecords: realCount, edgeRecords: index.places.length - realCount,
      queries: queries.length, comparisons: queries.length * 4, mismatches: 0, durationMs: performance.now() - start }));
  });
}
