import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const forbiddenPaths = [
  'unity',
  'docs/unity-migration-plan.md',
  'docs/unity-testing.md',
  'installer/roguelike-unity.iss',
  'scripts/export-unity-parity.mjs',
  'scripts/package-unity-windows.ps1',
  'scripts/sync-unity-ui-assets.mjs',
  'scripts/test-unity.ps1',
];

const existing = [];
for (const path of forbiddenPaths) {
  try {
    await access(resolve(root, path), constants.F_OK);
    existing.push(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const unityScripts = Object.keys(pkg.scripts ?? {}).filter((name) => name.startsWith('package:unity'));
if (existing.length || unityScripts.length) {
  process.stderr.write(`Unity remnants found: ${[...existing, ...unityScripts].join(', ')}\n`);
  process.exit(1);
}

process.stdout.write('No active Unity project or tooling remains.\n');
