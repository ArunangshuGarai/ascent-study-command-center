import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];

function run(label, command, args) {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[dev] ${label} exited with code ${code}`);
  });
  children.push(child);
}

run('api', process.execPath, ['--env-file-if-exists=.env', '--watch', 'server/index.js']);
run('web', npm, ['run', 'dev:client']);

function shutdown() {
  children.forEach((child) => {
    if (!child.killed) {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else child.kill('SIGINT');
    }
  });
  setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
