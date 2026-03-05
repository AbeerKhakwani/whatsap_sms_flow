// lib/scraper.js
// Scrapes product info (price, image, title, description) from retail product URLs

import * as cheerio from 'cheerio';

/**
 * Scrape product info from a URL
 * Extraction priority: OG tags → JSON-LD → meta tags
 * @param {string} url
 * @returns {{ title, description, price, currency, image, source }}
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

    // Merge results (OG takes priority, then JSON-LD, then meta)
    const result = {
      title: ogData.title || jsonLdData.title || metaData.title || $('title').text().trim() || null,
      description: ogData.description || jsonLdData.description || metaData.description || null,
      price: jsonLdData.price || ogData.price || null,
      currency: jsonLdData.currency || ogData.currency || 'USD',
      image: ogData.image || jsonLdData.image || null,
      source: ogData.title ? 'og_tags' : jsonLdData.title ? 'json_ld' : 'meta_tags'
    };

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract Open Graph meta tags
 */
function extractOGTags($) {
  const result = {};

  result.title = $('meta[property="og:title"]').attr('content')?.trim() || null;
  result.description = $('meta[property="og:description"]').attr('content')?.trim() || null;
  result.image = $('meta[property="og:image"]').attr('content')?.trim() || null;

  // Price from product OG tags
  const priceAmount = $('meta[property="product:price:amount"]').attr('content') ||
    $('meta[property="og:price:amount"]').attr('content');
  if (priceAmount) {
    result.price = parseFloat(priceAmount) || null;
  }

  result.currency = $('meta[property="product:price:currency"]').attr('content') ||
    $('meta[property="og:price:currency"]').attr('content') || null;

  return result;
}

/**
 * Extract JSON-LD structured data (schema.org Product)
 */
function extractJSONLD($) {
  const result = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const product = findProduct(data);
      if (!product) return;

      result.title = result.title || product.name || null;
      result.description = result.description || product.description || null;

      // Image
      if (product.image) {
        const img = Array.isArray(product.image) ? product.image[0] : product.image;
        result.image = result.image || (typeof img === 'string' ? img : img?.url) || null;
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
 * Extract standard meta tags (fallback)
 */
function extractMetaTags($) {
  return {
    title: $('meta[name="twitter:title"]').attr('content')?.trim() || null,
    description: $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[name="twitter:description"]').attr('content')?.trim() || null,
    image: $('meta[name="twitter:image"]').attr('content')?.trim() || null
  };
}
