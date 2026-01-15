import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

const images = [
  '/Users/ak/Pictures/Photos Library.photoslibrary/resources/renders/B/B8FBA4D5-CA34-44CD-853F-27263B6E0CCD_1_201_a.jpeg',
  '/Users/ak/Pictures/Photos Library.photoslibrary/resources/renders/2/2A5F1611-A848-45C1-A792-A2C063A39284_1_201_a.jpeg',
  '/Users/ak/Pictures/Photos Library.photoslibrary/resources/renders/F/FD8BBE7B-2791-47D9-A724-D465C8EF9934_1_201_a.jpeg'
];

async function compressImage(buffer) {
  const out = await sharp(buffer)
    .rotate() // Auto-rotate based on EXIF
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  console.log(`📸 Compressed: ${buffer.length} bytes → ${out.length} bytes (${Math.round(out.length / buffer.length * 100)}%)`);
  return out;
}

async function main() {
  for (let i = 0; i < images.length; i++) {
    const buffer = readFileSync(images[i]);
    const compressed = await compressImage(buffer);
    const base64 = compressed.toString('base64');
    writeFileSync(`/tmp/photo_${i + 1}_base64.txt`, base64);
    console.log(`✅ Photo ${i + 1} ready: ${base64.length} chars base64`);
  }
}

main().catch(console.error);
