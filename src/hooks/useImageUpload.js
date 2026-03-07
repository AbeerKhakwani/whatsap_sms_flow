// src/hooks/useImageUpload.js
// Shared image upload hook — handles photo selection, drag-drop, URL images, and Shopify upload

import { useState, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Process and compress an image file
 */
function processImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const maxSize = 1500;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const processedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
              type: 'image/jpeg'
            });
            resolve(processedFile);
          } else {
            reject(new Error('Processing failed'));
          }
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a file to base64 (for Shopify upload)
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const maxSize = 1200;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        resolve(base64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * @param {Object} options
 * @param {number} options.maxPhotos - max number of photos (default 10)
 */
export function useImageUpload({ maxPhotos = 10 } = {}) {
  const [photos, setPhotos] = useState([]);
  const [processingCount, setProcessingCount] = useState(0);
  const photoInputRef = useRef(null);

  const addPhotos = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/') ||
      f.name.toLowerCase().endsWith('.heic') ||
      f.name.toLowerCase().endsWith('.heif')
    );

    if (photos.length + imageFiles.length > maxPhotos) {
      return { error: `Maximum ${maxPhotos} photos allowed` };
    }

    setProcessingCount(imageFiles.length);

    for (const file of imageFiles) {
      try {
        const processedFile = await processImage(file);
        const preview = URL.createObjectURL(processedFile);
        setPhotos(prev => [...prev, { file: processedFile, preview, originalName: file.name }]);
        setProcessingCount(prev => prev - 1);
      } catch (err) {
        console.error('Error processing image:', err);
        setProcessingCount(prev => prev - 1);
      }
    }
    return { error: null };
  }, [photos.length, maxPhotos]);

  // Add photos from scraped URLs (lazy — stores URL, downloads at upload time)
  const addPhotosFromUrls = useCallback(async (urls) => {
    if (!urls?.length) return;
    const remaining = maxPhotos - photos.length;
    const toAdd = urls.slice(0, remaining);

    for (const url of toAdd) {
      setPhotos(prev => [...prev, {
        file: null,
        preview: url,
        originalName: url.split('/').pop()?.split('?')[0] || 'scraped.jpg',
        isFromUrl: true,
        url
      }]);
    }
  }, [photos.length, maxPhotos]);

  const removePhoto = useCallback((index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handlePhotoSelect = useCallback((e) => {
    if (e.target.files?.length) {
      addPhotos(e.target.files);
    }
    e.target.value = '';
  }, [addPhotos]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files) {
      addPhotos(e.dataTransfer.files);
    }
  }, [addPhotos]);

  // Upload all photos to Shopify for a product
  const uploadAllToShopify = useCallback(async (productId) => {
    const results = [];
    for (const photo of photos) {
      try {
        let base64;
        if (photo.isFromUrl && photo.url) {
          // For URL-based photos, fetch and convert
          const res = await fetch(photo.url);
          const blob = await res.blob();
          const file = new File([blob], photo.originalName, { type: blob.type || 'image/jpeg' });
          base64 = await fileToBase64(file);
        } else if (photo.file) {
          base64 = await fileToBase64(photo.file);
        } else {
          continue;
        }

        const uploadRes = await fetch(`${API_URL}/api/product-image?action=add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, base64, filename: photo.originalName })
        });
        const uploadData = await uploadRes.json();
        results.push({ success: !!uploadData.image, name: photo.originalName });
      } catch (err) {
        console.error('Photo upload error:', err);
        results.push({ success: false, name: photo.originalName, error: err.message });
      }
    }
    return results;
  }, [photos]);

  const reset = useCallback(() => {
    setPhotos([]);
    setProcessingCount(0);
  }, []);

  return {
    photos,
    processingCount,
    photoInputRef,
    addPhotos,
    addPhotosFromUrls,
    removePhoto,
    handlePhotoSelect,
    handleDragOver,
    handleDrop,
    uploadAllToShopify,
    reset
  };
}
