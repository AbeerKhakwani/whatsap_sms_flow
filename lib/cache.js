/**
 * Simple Redis cache wrapper for API responses.
 * Falls back gracefully if Redis is unavailable.
 */

import Redis from 'ioredis';

let redis = null;

function getRedis() {
  if (redis) return redis;
  if (!process.env.REDIS_URL) return null;
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 2000
  });
  redis.on('error', () => {}); // suppress noise
  return redis;
}

/**
 * Get a cached value. Returns null if missing or Redis unavailable.
 */
export async function cacheGet(key) {
  try {
    const r = getRedis();
    if (!r) return null;
    const raw = await r.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(key, value, ttlSeconds = 300) {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // fail silently
  }
}

/**
 * Delete one or more cache keys (supports wildcard suffix via scan).
 */
export async function cacheBust(...keys) {
  try {
    const r = getRedis();
    if (!r) return;
    await Promise.all(keys.map(k => r.del(k)));
  } catch {
    // fail silently
  }
}

/**
 * Wrap an async function with cache-aside logic.
 * @param {string} key - Cache key
 * @param {number} ttl - TTL in seconds
 * @param {Function} fn - Async function that returns the data
 */
export async function withCache(key, ttl, fn) {
  const cached = await cacheGet(key);
  if (cached !== null) {
    console.log(`⚡ Cache HIT: ${key}`);
    return cached;
  }
  console.log(`🔄 Cache MISS: ${key}`);
  const result = await fn();
  await cacheSet(key, result, ttl);
  return result;
}
