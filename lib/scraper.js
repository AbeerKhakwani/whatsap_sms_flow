// lib/scraper.js
// Scrapes product info (price, images, title, description, material) from retail product URLs

import * as cheerio from 'cheerio';

const FABRIC_KEYWORDS = [
  'lawn', 'silk', 'chiffon', 'cotton', 'organza', 'net', 'velvet',
  'jamawar', 'khaddar', 'linen', 'cambric', 'jacquard', 'karandi',
  'viscose', 'crepe', 'georgette', 'satin', 'wool', 'cashmere',
  'dhanak', 'marina', 'grip', 'raw silk', 'tissue', 'banarsi'
];

/**
 * Scrape product info from a URL
 * Extraction priority: OG tags → JSON-LD → meta tags
 * @param {string} url
 * @returns {{ title, description, price, currency, image, images, material, source }}
 */
export async function scrapePage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try extraction in priority order
    const ogData = extractOGTags($);
    const jsonLdData = extractJSONLD($);
    const metaData = extractMetaTags($);

    // Merge images from all sources and deduplicate
    const allImages = deduplicateImages([
      ...(ogData.images || []),
      ...(jsonLdData.images || []),
      ...(metaData.images || [])
    ]).slice(0, 4);

    // Merge material: JSON-LD > OG > description keyword scan
    const descText = ogData.description || jsonLdData.description || metaData.description || '';
    const material = jsonLdData.material || ogData.material ||
      extractMaterialFromText(descText) || extractMaterialFromText($('body').text()) || null;

    const result = {
      title: ogData.title || jsonLdData.title || metaData.title || $('title').text().trim() || null,
      description: ogData.description || jsonLdData.description || metaData.description || null,
      price: jsonLdData.price || ogData.price || null,
      currency: jsonLdData.currency || ogData.currency || 'USD',
      image: allImages[0] || null,
      images: allImages,
      material,
      source: ogData.title ? 'og_tags' : jsonLdData.title ? 'json_ld' : 'meta_tags'
    };

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract Open Graph meta tags — collects ALL og:image tags
 */
function extractOGTags($) {
  const result = { images: [] };

  result.title = $('meta[property="og:title"]').attr('content')?.trim() || null;
  result.description = $('meta[property="og:description"]').attr('content')?.trim() || null;

  // Collect ALL og:image tags
  $('meta[property="og:image"]').each((_, el) => {
    const src = $(el).attr('content')?.trim();
    if (src) result.images.push(src);
  });

  // Price from product OG tags
  const priceAmount = $('meta[property="product:price:amount"]').attr('content') ||
    $('meta[property="og:price:amount"]').attr('content');
  if (priceAmount) {
    result.price = parseFloat(priceAmount) || null;
  }

  result.currency = $('meta[property="product:price:currency"]').attr('content') ||
    $('meta[property="og:price:currency"]').attr('content') || null;

  // Material from product OG tags
  result.material = $('meta[property="product:material"]').attr('content')?.trim() || null;

  return result;
}

/**
 * Extract JSON-LD structured data (schema.org Product) — full image array + material
 */
function extractJSONLD($) {
  const result = { images: [] };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const product = findProduct(data);
      if (!product) return;

      result.title = result.title || product.name || null;
      result.description = result.description || product.description || null;

      // Collect full image array
      if (product.image) {
        const imgs = Array.isArray(product.image) ? product.image : [product.image];
        for (const img of imgs) {
          const url = typeof img === 'string' ? img : img?.url;
          if (url) result.images.push(url);
        }
      }

      // Price from offers
      const offers = product.offers;
      if (offers) {
        const offer = Array.isArray(offers) ? offers[0] : offers;
        if (offer?.price) {
          result.price = result.price || parseFloat(offer.price) || null;
          result.currency = result.currency || offer.priceCurrency || null;
        }
      }

      // Material from JSON-LD
      result.material = result.material || product.material || null;
    } catch {
      // Invalid JSON-LD, skip
    }
  });

  return result;
}

/**
 * Find a Product object in JSON-LD data (handles @graph arrays)
 */
function findProduct(data) {
  if (!data) return null;
  if (data['@type'] === 'Product') return data;
  if (Array.isArray(data['@type']) && data['@type'].includes('Product')) return data;
  if (data['@graph']) {
    for (const item of data['@graph']) {
      const found = findProduct(item);
      if (found) return found;
    }
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProduct(item);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Extract standard meta tags (fallback) — includes twitter:image
 */
function extractMetaTags($) {
  const images = [];
  const twitterImg = $('meta[name="twitter:image"]').attr('content')?.trim();
  if (twitterImg) images.push(twitterImg);

  return {
    title: $('meta[name="twitter:title"]').attr('content')?.trim() || null,
    description: $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[name="twitter:description"]').attr('content')?.trim() || null,
    images
  };
}

/**
 * Deduplicate image URLs (normalize trailing slashes, query params)
 */
function deduplicateImages(urls) {
  const seen = new Set();
  return urls.filter(url => {
    if (!url) return false;
    // Normalize: strip trailing slash, ignore query params for dedup
    const normalized = url.split('?')[0].replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Extract material/fabric from text using keyword matching
 */
function extractMaterialFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const fabric of FABRIC_KEYWORDS) {
    // Match whole word (with word boundaries)
    const regex = new RegExp(`\\b${fabric}\\b`, 'i');
    if (regex.test(lower)) {
      return fabric.charAt(0).toUpperCase() + fabric.slice(1);
    }
  }
  return null;
}
