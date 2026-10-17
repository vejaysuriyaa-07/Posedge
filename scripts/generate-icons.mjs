// Renders the Posedge logo SVGs to the PNG sizes the PWA manifest and iOS need.
// Usage: npm run icons   (uses Playwright's Chromium; set CHROMIUM_PATH to override)
import { chromium } from '@playwright/test';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const WAVE = (scale = 1) => {
  // Wave drawn for a 512 canvas; `scale` shrinks it around the centre (maskable safe zone).
  const t = (v) => 256 + (v - 256) * scale;
  const pts = [
    [84, 336],
    [172, 336],
    [172, 176],
    [340, 176],
    [340, 336],
    [428, 336],
  ]
    .map(([x, y]) => `${t(x)},${t(y)}`)
    .join(' ');
  return `<polyline points="${pts}" fill="none" stroke="#fff" stroke-width="${36 * scale}" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="${t(172)}" y1="${t(336)}" x2="${t(172)}" y2="${t(176)}" stroke="#FDE68A" stroke-width="${40 * scale}" stroke-linecap="round"/>`;
};

const GRADIENT = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#38BDF8"/></linearGradient></defs>`;

export const roundedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRADIENT}<rect width="512" height="512" rx="112" fill="url(#g)"/>${WAVE()}</svg>`;
const fullBleedSvg = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRADIENT}<rect width="512" height="512" fill="url(#g)"/>${WAVE(scale)}</svg>`;

const targets = [
  { file: 'pwa-192x192.png', size: 192, svg: roundedSvg },
  { file: 'pwa-512x512.png', size: 512, svg: roundedSvg },
  { file: 'maskable-512x512.png', size: 512, svg: fullBleedSvg(0.72) },
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleedSvg(0.82) },
];

writeFileSync(publicDir + 'favicon.svg', roundedSvg + '\n');

const fallback = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(fallback) ? fallback : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
for (const { file, size, svg } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  const png = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  writeFileSync(publicDir + file, png);
  console.log('wrote', file);
}
await browser.close();
