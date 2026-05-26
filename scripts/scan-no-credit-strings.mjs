import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const patterns = ['50 积分', '150 积分', '积分生成', '已扣积分', 'consumeCredits'];
const srcFiles = execFileSync('git', ['ls-files', 'src'], {
  cwd: rootDir,
  encoding: 'utf8',
})
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean);

const violations = [];

for (const relativePath of srcFiles) {
  const absolutePath = path.join(rootDir, relativePath);
  const content = readFileSync(absolutePath, 'utf8');

  patterns.forEach((pattern) => {
    const lineIndex = content.split('\n').findIndex((line) => line.includes(pattern));
    if (lineIndex !== -1) {
      violations.push(`${relativePath}:${lineIndex + 1} contains "${pattern}"`);
    }
  });
}

if (violations.length > 0) {
  console.error('Disallowed credit strings found in src/:');
  violations.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('No disallowed credit strings found in src/.');
