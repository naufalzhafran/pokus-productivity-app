import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';

// Retain Pokus's concentric-circle mark; the maskable version keeps it in the safe zone.
const icon = (maskable) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#28665b"/><circle cx="256" cy="256" r="${maskable ? 174 : 210}" fill="#f6f5f0"/><circle cx="256" cy="256" r="${maskable ? 130 : 157}" fill="#28665b"/><circle cx="256" cy="256" r="${maskable ? 65 : 78}" fill="#f6f5f0"/></svg>`;
await Promise.all([
  sharp(Buffer.from(icon(false))).resize(192,192).png().toFile('public/pwa-192.png'),
  sharp(Buffer.from(icon(false))).resize(512,512).png().toFile('public/pwa-512.png'),
  sharp(Buffer.from(icon(true))).resize(512,512).png().toFile('public/pwa-maskable-512.png'),
  sharp(Buffer.from(icon(false))).resize(180,180).png().toFile('public/apple-touch-icon.png'),
  writeFile('public/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#28665b"/><circle cx="16" cy="16" r="12" fill="#f6f5f0"/><circle cx="16" cy="16" r="6" fill="#28665b"/></svg>\n'),
]);
