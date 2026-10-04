import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

const REGEX = /\btext-\[(8|9)px\]/g;

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && full.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(srcDir);
let total = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let count = 0;
  const matches = content.match(REGEX);
  if (matches) {
    count = matches.length;
    total += count;
    const replaced = content.replace(REGEX, 'text-[10px]');
    fs.writeFileSync(file, replaced, 'utf8');
    const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
    console.log(`${rel}: ${count}`);
  }
}

console.log(`Total: ${total}`);
