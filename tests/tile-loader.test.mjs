import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileLoader } from '../tile-loader.js';

function fixture(options = {}) {
  const requests = [];
  class FakeImage {
    set src(value) { this.url = value; if (value) requests.push(this); }
    get src() { return this.url; }
    succeed() { this.onload?.(); }
    fail() { this.onerror?.(); }
  }
  return { requests, loader: createTileLoader({ ImageClass: FakeImage, ...options }) };
}

test('cancelled queued prefetch does not delay the newest high-priority destination', async () => {
  const { loader, requests } = fixture({ maxConcurrent: 1 });
  const active = loader.load('active');
  const stale = { cancelled: false, priority: 0 };
  const old = loader.load('stale', stale);
  const aborted = assert.rejects(old, { name: 'AbortError' });
  const low = loader.load('background');
  const high = loader.load('destination', { cancelled: false, priority: 10 });
  stale.cancelled = true; loader.prune();
  assert.equal(loader.stats.queued, 2);
  requests[0].succeed();
  assert.equal(requests[1].url, 'destination');
  requests[1].succeed(); assert.equal(requests[2].url, 'background');
  requests[2].succeed(); await Promise.all([active, low, high, aborted]);
  assert.equal(loader.stats.cancelled, 1); assert.equal(loader.stats.active, 0);
});

test('more than 96 pending URLs never evict deduplication or duplicate an active request', async () => {
  const { loader, requests } = fixture({ maxConcurrent: 1, maxCache: 96 });
  const promises = Array.from({ length: 110 }, (_, i) => loader.load('tile-' + i));
  assert.strictEqual(loader.load('tile-0'), promises[0]);
  assert.strictEqual(loader.load('tile-1'), promises[1]);
  assert.equal(loader.stats.pending, 110);
  for (let i = 0; i < 110; i++) requests[i].succeed();
  await Promise.all(promises);
  assert.equal(requests.length, 110); assert.equal(new Set(requests.map(r => r.url)).size, 110);
  assert.equal(loader.stats.cached, 96); assert.equal(loader.stats.pending, 0);
});

test('a queued shared URL stays alive for its remaining consumer and honors its new priority', async () => {
  const { loader, requests } = fixture({ maxConcurrent: 1 });
  const blocker = loader.load('blocker'), background = loader.load('background');
  const a = { cancelled: false, priority: 0 }, b = { cancelled: false, priority: 0 };
  const shared = loader.load('shared', a);
  assert.strictEqual(loader.load('shared', b), shared);
  a.cancelled = true; b.priority = 20; loader.prune();
  requests[0].succeed(); assert.equal(requests[1].url, 'shared');
  requests[1].succeed(); requests[2].succeed();
  await Promise.all([blocker, background, shared]); assert.equal(loader.stats.cancelled, 0);
});

test('default consumers keep requests wanted and an in-flight stale request may finish', async () => {
  const { loader, requests } = fixture({ maxConcurrent: 1 });
  const stale = { cancelled: false, priority: 0 };
  const active = loader.load('active', stale), shared = loader.load('queued', stale);
  loader.load('queued'); stale.cancelled = true; loader.prune();
  requests[0].succeed(); requests[1].succeed();
  await Promise.all([active, shared]); assert.equal(loader.stats.completed, 2);
});

test('failure leaves no cached rejection and the same URL can retry', async () => {
  const { loader, requests } = fixture();
  const failed = loader.load('tile'), rejection = assert.rejects(failed, /unavailable/);
  requests[0].fail(); await rejection;
  const retry = loader.load('tile'); requests[1].succeed();
  assert.strictEqual(await retry, requests[1]);
  assert.equal(loader.stats.failed, 1); assert.equal(loader.stats.completed, 1);
});

test('timeout and a late load callback finish once and release the next queue slot', async () => {
  const { loader, requests } = fixture({ maxConcurrent: 1, timeoutMs: 10 });
  const timed = loader.load('timeout');
  const late = requests[0].onload;
  const next = loader.load('next');
  await assert.rejects(timed, /timeout/);
  late(); assert.equal(loader.stats.active, 1); assert.equal(loader.stats.failed, 1);
  assert.equal(requests[1].url, 'next'); requests[1].succeed(); await next;
  assert.equal(loader.stats.active, 0); assert.equal(loader.stats.pending, 0);
});

test('synchronous image success, failure and throwing src setters are safe', async () => {
  let starts = 0;
  class SyncImage {
    set src(url) {
      starts++;
      if (url === 'throws') throw new Error('bad src');
      if (url === 'error') this.onerror(); else this.onload();
    }
  }
  const loader = createTileLoader({ ImageClass: SyncImage });
  await loader.load('ok');
  await assert.rejects(loader.load('error'), /unavailable/);
  await assert.rejects(loader.load('throws'), /bad src/);
  await loader.load('ok'); assert.equal(starts, 3);
  assert.equal(loader.stats.active, 0); assert.equal(loader.stats.pending, 0);
});

test('completed cache is LRU and does not retain cancelled queue entries', async () => {
  const { loader, requests } = fixture({ maxCache: 2 });
  for (const url of ['a', 'b']) { const p = loader.load(url); requests.at(-1).succeed(); await p; }
  await loader.load('a');
  const c = loader.load('c'); requests.at(-1).succeed(); await c;
  await loader.load('a'); assert.equal(requests.length, 3);
  const b = loader.load('b'); requests.at(-1).succeed(); await b;
  assert.equal(requests.length, 4); assert.equal(loader.stats.cached, 2);
  await assert.rejects(loader.load('cancelled', { cancelled: true }), { name: 'AbortError' });
  assert.equal(requests.length, 4);
});
