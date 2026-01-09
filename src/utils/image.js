// Shopify CDN image resizing utility
// Adds size parameter to Shopify image URLs for faster loading

export function getOptimizedImage(url, size = 400) {
  if (!url) return url;

  // Shopify CDN images support _WIDTHxHEIGHT suffix before extension
  // e.g., image.jpg -> image_400x400.jpg

  // Check if it's a Shopify CDN URL
  if (url.includes('cdn.shopify.com')) {
    // Already has size suffix? Return as-is
    if (url.match(/_\d+x\d*\./)) return url;

    // Add size suffix before file extension
    return url.replace(/(\.[^.]+)$/, `_${size}x${size}$1`);
  }

  return url;
}

// Thumbnail for cards
export function getThumbnail(url) {
  return getOptimizedImage(url, 500);
}

// Medium size for detail views
export function getMediumImage(url) {
  return getOptimizedImage(url, 600);
}
