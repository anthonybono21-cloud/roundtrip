/* Shared tile requests survive cache eviction. Consumers may cancel queued
 * work or raise its priority without disrupting another destination's request.
 * Cancellation after a request starts is checked by the caller before drawing.
 */
export function createTileLoader({ ImageClass = Image, maxConcurrent = 8,
  maxCache = 96, timeoutMs = 15000 } = {}) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new RangeError('maxConcurrent must be positive');
  if (!Number.isInteger(maxCache) || maxCache < 0) throw new RangeError('maxCache must be nonnegative');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new RangeError('timeoutMs must be nonnegative');
  const pending = new Map(), cache = new Map(), queue = [];
  const alwaysWanted = { cancelled: false, priority: 0 };
  let active = 0, pumping = false;
  const stats = { started: 0, completed: 0, failed: 0, cancelled: 0, cacheHits: 0, deduplicated: 0,
    get active() { return active; }, get queued() { return queue.length; },
    get pending() { return pending.size; }, get cached() { return cache.size; } };
  const abortError = () => Object.assign(new Error('Tile no longer needed'), { name: 'AbortError' });
  const wanted = job => [...job.consumers].some(consumer => !consumer.cancelled);
  const priority = job => {
    let best = -Infinity;
    for (const consumer of job.consumers) if (!consumer.cancelled) {
      best = Math.max(best, Number.isFinite(consumer.priority) ? consumer.priority : 0);
    }
    return best;
  };
  function removeCancelled() {
    for (let i = queue.length - 1; i >= 0; i--) {
      const job = queue[i];
      if (wanted(job)) continue;
      queue.splice(i, 1); pending.delete(job.url);
      stats.cancelled++; job.reject(abortError());
    }
  }
  function start(job) {
    active++; stats.started++;
    let image = null, timer, finished = false;
    const finish = error => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (image) image.onload = image.onerror = null;
      active--; pending.delete(job.url);
      if (error) { stats.failed++; job.reject(error); }
      else {
        stats.completed++;
        if (maxCache) {
          cache.delete(job.url); cache.set(job.url, image);
          while (cache.size > maxCache) cache.delete(cache.keys().next().value);
        }
        job.resolve(image);
      }
      pump();
    };
    try {
      image = new ImageClass(); image.crossOrigin = 'anonymous';
      image.onload = () => finish();
      image.onerror = () => finish(new Error('Tile unavailable: ' + job.url));
      timer = setTimeout(() => {
        finish(new Error('Tile timeout: ' + job.url));
        // Detach handlers before resetting src; some engines dispatch an error.
        try { image.src = ''; } catch {}
      }, timeoutMs);
      image.src = job.url;
    } catch (error) { finish(error); }
  }
  function pump() {
    if (pumping) return;
    pumping = true;
    try {
      removeCancelled();
      while (active < maxConcurrent && queue.length) {
        // Mutable priorities are read when a slot opens. Equal priorities keep
        // FIFO order, including requests shared by multiple consumers.
        let best = 0;
        for (let i = 1; i < queue.length; i++) if (priority(queue[i]) > priority(queue[best])) best = i;
        start(queue.splice(best, 1)[0]);
        removeCancelled();
      }
    } finally { pumping = false; }
  }
  function load(url, consumer = null) {
    consumer = consumer || alwaysWanted;
    if (consumer.cancelled) return Promise.reject(abortError());
    const existing = pending.get(url);
    if (existing) {
      existing.consumers.add(consumer); stats.deduplicated++;
      pump(); return existing.promise;
    }
    if (cache.has(url)) {
      const image = cache.get(url); cache.delete(url); cache.set(url, image);
      stats.cacheHits++; return Promise.resolve(image);
    }
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const job = { url, promise, resolve, reject, consumers: new Set([consumer]) };
    pending.set(url, job); queue.push(job); pump();
    return promise;
  }
  return { load, prune: pump, stats };
}
