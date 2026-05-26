import { spawnSync } from 'node:child_process';

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  { label: 'Server syntax', command: 'node', args: ['--check', 'server.js'] },
  { label: 'Type check', command: npmExecutable, args: ['run', 'lint'] },
  { label: 'Build', command: npmExecutable, args: ['run', 'build'] },
  { label: 'Smoke tests', command: npmExecutable, args: ['run', 'test:smoke'] },
  { label: 'De-credit scan', command: npmExecutable, args: ['run', 'scan:decredit'] },
  { label: 'Secret scan', command: npmExecutable, args: ['run', 'scan:secrets'] },
];

for (const step of steps) {
  console.log(`\n==> ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nRelease gate passed.');
