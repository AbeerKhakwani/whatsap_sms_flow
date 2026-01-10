/**
 * Redis Photo Management for WhatsApp Photo Burst Handling
 *
 * Uses Redis to handle concurrent photo uploads atomically.
 * Prevents race conditions when users send multiple photos rapidly.
 */

import Redis from 'ioredis';

// Create Redis client (connects to REDIS_URL env var)
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true
  });

  redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
  });

  // Connect asynchronously
  redis.connect().catch(err => {
    console.error('❌ Redis initial connection failed:', err.message);
  });
}

const PHOTO_LIST_PREFIX = 'photos:';
const DEDUP_PREFIX = 'dedup:';
const TTL_HOURS = 24;
const TTL_SECONDS = TTL_HOURS * 60 * 60;

/**
 * Claim a photo for processing (deduplication)
 *
 * @param {string} phone - Phone number
 * @param {string} mediaId - WhatsApp media ID
 * @returns {Promise<boolean>} - True if claimed (first time), false if duplicate
 */
export async function claimPhoto(phone, mediaId) {
  try {
    // Check if Redis is available
    if (!redis) {
      console.warn('⚠️ Redis not configured, skipping dedup');
      return true; // Allow photo without dedup
    }

    const key = `${DEDUP_PREFIX}${phone}:${mediaId}`;

    // SET NX EX returns 'OK' if key was set (new), null if it already exists (duplicate)
    const result = await redis.set(key, '1', 'NX', 'EX', TTL_SECONDS);

    const claimed = result === 'OK';
    console.log(`📸 Redis dedup check for ${mediaId}: ${claimed ? 'CLAIMED' : 'DUPLICATE'}`);

    return claimed;
  } catch (error) {
    console.error('❌ Redis claimPhoto error:', error.message);
    // On error, allow the photo (fail open)
    return true;
  }
}

/**
 * Add a Shopify file ID to the photo list (atomic)
 *
 * @param {string} phone - Phone number
 * @param {string} fileId - Shopify GraphQL file ID (gid://shopify/MediaImage/xxx)
 * @param {string} mediaId - WhatsApp media ID (for logging)
 * @returns {Promise<number>} - Total photo count after adding
 */
export async function addPhoto(phone, fileId, mediaId) {
  try {
    // Check if Redis is available
    if (!redis) {
      console.warn('⚠️ Redis not configured, photo will be stored in context only');
      return 1; // Return count 1 (photos will be managed in context)
    }

    const key = `${PHOTO_LIST_PREFIX}${phone}`;

    // RPUSH is atomic - safe for concurrent calls
    const count = await redis.rpush(key, fileId);

    // Set TTL on the list (only if not already set)
    await redis.expire(key, TTL_SECONDS);

    console.log(`✅ Redis: Added photo ${count} for ${phone} (mediaId: ${mediaId})`);

    return count;
  } catch (error) {
    console.error('❌ Redis addPhoto error:', error.message);
    // Return 1 so flow continues (photos stored in context as backup)
    return 1;
  }
}

/**
 * Get photo count (instant O(1) operation)
 *
 * @param {string} phone - Phone number
 * @returns {Promise<number>} - Number of photos
 */
export async function getPhotoCount(phone) {
  try {
    if (!redis) return 0;
    const key = `${PHOTO_LIST_PREFIX}${phone}`;
    const count = await redis.llen(key);
    return count || 0;
  } catch (error) {
    console.error('❌ Redis getPhotoCount error:', error);
    return 0;
  }
}

/**
 * Get all photo file IDs
 *
 * @param {string} phone - Phone number
 * @returns {Promise<string[]>} - Array of Shopify file IDs
 */
export async function getPhotos(phone) {
  try {
    // Check if Redis is available
    if (!redis) {
      console.warn('⚠️ Redis not configured, returning empty array');
      return [];
    }

    const key = `${PHOTO_LIST_PREFIX}${phone}`;

    // Get all items in the list (0 to -1 means entire list)
    const fileIds = await redis.lrange(key, 0, -1);

    console.log(`📸 Redis: Retrieved ${fileIds.length} photos for ${phone}`);

    return fileIds || [];
  } catch (error) {
    console.error('❌ Redis getPhotos error:', error.message);
    return [];
  }
}

/**
 * Clear all photos for a phone number
 *
 * @param {string} phone - Phone number
 * @returns {Promise<void>}
 */
export async function clearPhotos(phone) {
  try {
    if (!redis) return;

    const listKey = `${PHOTO_LIST_PREFIX}${phone}`;

    // Delete the photo list
    await redis.del(listKey);

    // Note: dedup keys auto-expire after TTL, so we don't need to delete them

    console.log(`🗑️ Redis: Cleared photos for ${phone}`);
  } catch (error) {
    console.error('❌ Redis clearPhotos error:', error);
  }
}

/**
 * Clear all dedup keys for a phone number (use when restarting flow)
 *
 * @param {string} phone - Phone number
 * @returns {Promise<void>}
 */
export async function clearDedupKeys(phone) {
  try {
    if (!redis) return;

    // Get all dedup keys for this phone
    const pattern = `${DEDUP_PREFIX}${phone}:*`;
    const keys = await redis.keys(pattern);

    if (keys && keys.length > 0) {
      await Promise.all(keys.map(key => redis.del(key)));
      console.log(`🗑️ Redis: Cleared ${keys.length} dedup keys for ${phone}`);
    }
  } catch (error) {
    console.error('❌ Redis clearDedupKeys error:', error);
  }
}

/**
 * Check Redis connection health
 *
 * @returns {Promise<boolean>} - True if Redis is working
 */
export async function healthCheck() {
  try {
    if (!redis) return false;

    const testKey = 'health:check';
    await redis.set(testKey, 'ok', 'EX', 60);
    const result = await redis.get(testKey);
    await redis.del(testKey);
    return result === 'ok';
  } catch (error) {
    console.error('❌ Redis health check failed:', error);
    return false;
  }
}
