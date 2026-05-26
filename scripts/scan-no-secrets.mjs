import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: rootDir,
  encoding: 'utf8',
})
  .split('\0')
  .map((file) => file.trim())
  .filter(Boolean);

if (trackedFiles.includes('.env.local')) {
  console.error('.env.local is tracked and must be removed from git.');
  process.exit(1);
}

const detectors = [
  {
    name: 'Explicit API key assignment',
    regex: /\b(?:SILICONFLOW_API_KEY|TAVILY_API_KEY|GEMINI_API_KEY)\b\s*[:=]\s*["']?(?!YOUR_|process\.env\b|\$\{?process\.env\b|CHANGE_ME|example|placeholder|xxx\b|undefined\b|null\b)([A-Za-z0-9._-]{12,})/i,
  },
  {
    name: 'Google API key',
    regex: /\bAIza[0-9A-Za-z_-]{20,}\b/,
  },
  {
    name: 'OpenAI-style secret',
    regex: /\bsk-[A-Za-z0-9]{16,}\b/,
  },
  {
    name: 'Bearer token literal',
    regex: /Bearer\s+[A-Za-z0-9._-]{20,}/,
  },
];

const ignoredFiles = new Set(['package-lock.json']);
const findings = [];

for (const relativePath of trackedFiles) {
  if (ignoredFiles.has(relativePath)) {
    continue;
  }

  const absolutePath = path.join(rootDir, relativePath);
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    detectors.forEach((detector) => {
      if (detector.regex.test(line)) {
        findings.push(`${relativePath}:${index + 1} matched ${detector.name}`);
      }
    });
  });
}

if (findings.length > 0) {
  console.error('Potential plaintext secrets found in tracked files:');
  findings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('.env.local is not tracked and no plaintext API keys were detected in tracked files.');
