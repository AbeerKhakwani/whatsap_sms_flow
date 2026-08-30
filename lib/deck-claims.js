// lib/deck-claims.js — short-lived claims so several admins can work the cleanup deck
// at once without being dealt the same listing.
//
// Claims live in Redis under one key with a TTL, not in Postgres: they are disposable by
// nature. If Redis is unavailable every function degrades to "nothing is claimed", which
// gives exactly today's behaviour rather than blocking the queue.
//
// A claim is advisory. It hides a card from OTHER admins while someone works it; it never
// prevents a write, so a stale claim can't lock a listing out of being edited.

import { cacheGet, cacheSet } from './cache.js';

const KEY = 'deck:claims';
const CLAIM_MINUTES = 20;      // long enough to work a batch of five, short enough to self-heal
const KEY_TTL_SECONDS = 3600;

const fresh = (entry, now) => entry && (now - entry.at) < CLAIM_MINUTES * 60 * 1000;

/** @returns {Promise<Record<string,{admin:string,at:number}>>} live claims, expired ones dropped */
export async function getClaims(now = Date.now()) {
  const raw = (await cacheGet(KEY)) || {};
  const live = {};
  for (const [id, entry] of Object.entries(raw)) if (fresh(entry, now)) live[id] = entry;
  return live;
}

/**
 * Claim listings for an admin. Already-claimed-by-someone-else ids are skipped, not stolen.
 * @returns {Promise<string[]>} the ids actually claimed (including ones already theirs)
 */
export async function claim(ids, admin, now = Date.now()) {
  if (!admin || !ids?.length) return [];
  const claims = await getClaims(now);
  const mine = [];
  for (const id of ids.map(String)) {
    const held = claims[id];
    if (held && held.admin !== admin) continue;
    claims[id] = { admin, at: now };
    mine.push(id);
  }
  await cacheSet(KEY, claims, KEY_TTL_SECONDS);
  return mine;
}

/** Release listings this admin holds. Never releases another admin's claim. */
export async function release(ids, admin, now = Date.now()) {
  if (!admin || !ids?.length) return;
  const claims = await getClaims(now);
  for (const id of ids.map(String)) if (claims[id]?.admin === admin) delete claims[id];
  await cacheSet(KEY, claims, KEY_TTL_SECONDS);
}

/** Ids currently held by someone OTHER than this admin. */
export async function claimedByOthers(admin, now = Date.now()) {
  const claims = await getClaims(now);
  return new Set(Object.entries(claims).filter(([, e]) => e.admin !== admin).map(([id]) => id));
}
