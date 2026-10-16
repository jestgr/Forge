// Turn a copy of app/ into the preview build: its own install identity and name,
// so it can sit next to the real Forge on the phone. Usage: node make-preview.mjs <dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: make-preview.mjs <dir>');
const file = join(dir, 'manifest.webmanifest');
const m = JSON.parse(readFileSync(file, 'utf8'));
m.id = 'forge-preview';
m.name = 'Forge Preview';
m.short_name = 'Forge β';
writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
console.log('preview manifest written:', file);
