// lib/cors.js
// Shared CORS setup for all API endpoints.
// Handles preflight OPTIONS + sets headers in one call.

/**
 * Set CORS headers and handle OPTIONS preflight.
 * Returns true if it was an OPTIONS request (already responded).
 *
 * @param {Object} req
 * @param {Object} res
 * @param {string} [methods='GET, POST, PUT, OPTIONS']
 * @returns {boolean} true if OPTIONS was handled (caller should return)
 */
export function cors(req, res, methods = 'GET, POST, PUT, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
