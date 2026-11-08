// Every customer language must give the advisor mascot (Mitu) its name, greeting and status lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const i18n = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/src/i18n');
const KEYS = ['mitu.name', 'mitu.role', 'mitu.hi', 'mitu.sub', 'mitu.thinking', 'mitu.listening', 'mitu.happy'];
const files = ['en.js', ...fs.readdirSync(path.join(i18n, 'locales')).map(file => `locales/${file}`)];

test('all 10 languages define Mitu\'s name and greeting', async () => {
  assert.equal(files.length, 10);
  for (const file of files) {
    const table = (await import(pathToFileURL(path.join(i18n, file)).href)).default;
    for (const key of KEYS) assert.ok(typeof table[key] === 'string' && table[key].trim(), `${file} is missing ${key}`);
    assert.ok(table['mitu.hi'].includes(table['mitu.name']), `${file}: the greeting should say the name`);
  }
});
