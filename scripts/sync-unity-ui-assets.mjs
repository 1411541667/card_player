import { createRequire } from 'node:module';
import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'unity/Assets/StreamingAssets/presentation');
const sharpPath = process.argv.find(a => a.startsWith('--sharp='))?.slice(8) ?? 'sharp';
const sharp = createRequire(import.meta.url)(sharpPath);
await mkdir(destination, { recursive: true });
const sources = {};
for (const group of ['icon_map', 'icon_card', 'icon_battle']) {
  const dir = resolve(root, 'src/content/wasteland/assets', group);
  await mkdir(resolve(destination, group), { recursive: true });
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.svg')).sort()) {
    const source = await readFile(resolve(dir, file));
    await sharp(source).resize(128, 128).png().toFile(resolve(destination, group, file.replace('.svg', '.png')));
    sources[`${group}/${file}`] = createHash('sha256').update(source).digest('hex');
  }
}
await copyFile(resolve(root, 'src/open.mp4'), resolve(destination, 'menu.mp4'));
await copyFile(resolve(root, 'src/appimpage.jpg'), resolve(destination, 'menu.jpg'));
await writeFile(resolve(destination, 'asset-sources.json'), JSON.stringify(sources, null, 2) + '\n');
console.log(`Synced ${Object.keys(sources).length} web icons and menu media to Unity.`);
