// api/scrape-url.js
// Scrapes product info from a retail product URL (price, image, title, description)

import { scrapePage } from '../lib/scraper.js';
import { cors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Basic URL validation
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const data = await scrapePage(url);

    return res.status(200).json({
      success: true,
      url,
      data
    });
  } catch (error) {
    console.error('Scrape error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.name === 'AbortError' ? 'Request timed out' : error.message
    });
  }
}
