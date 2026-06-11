/**
 * gen-icons — генерация PWA PNG-иконок из public/icons/favicon.svg.
 *
 * Зачем: manifest.webmanifest ссылается на icon-192.png / icon-512.png /
 * icon-512-maskable.png. Без них Chrome не считает PWA устанавливаемым
 * (нет install prompt) — обнаружено аудитом прода 2026-06-11.
 *
 * Запуск:  node scripts/gen-icons.mjs   (из kip-frontend; нужен devDep sharp)
 * Выход:   public/icons/icon-192.png, icon-512.png, icon-512-maskable.png
 *
 * Maskable: safe zone — лого 80% площади на фоне бренд-цвета #1e3a8a,
 * чтобы Android-маски (круг/squircle) не резали букву.
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(here, '..', 'public', 'icons');
const svg = readFileSync(path.join(iconsDir, 'favicon.svg'));

const BRAND = '#1e3a8a';

async function plain(size) {
  const out = path.join(iconsDir, `icon-${size}.png`);
  await sharp(svg, { density: 72 * (size / 64) })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log('✓', out);
}

async function maskable(size) {
  const inner = Math.round(size * 0.8);
  const logo = await sharp(svg, { density: 72 * (inner / 64) })
    .resize(inner, inner)
    .png()
    .toBuffer();
  const out = path.join(iconsDir, `icon-${size}-maskable.png`);
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(out);
  console.log('✓', out);
}

await plain(192);
await plain(512);
await maskable(512);
console.log('Готово.');
