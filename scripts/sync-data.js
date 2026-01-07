const fs = require('fs');
const path = require('path');

const src = path.join(process.cwd(), 'data', 'dialogues.json');
const destDir = path.join(process.cwd(), 'public', 'data');
const dest = path.join(destDir, 'dialogues.json');

if (!fs.existsSync(src)) {
  console.error('data/dialogues.json not found.');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Synced data/dialogues.json to public/data/dialogues.json');
