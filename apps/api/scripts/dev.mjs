// Dev server: tsc in watch (emette i metadata dei decoratori NestJS, cosa che esbuild/tsx non fa) + node --watch su dist.
import { spawn } from 'node:child_process';
const tsc = spawn('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { stdio: 'inherit' });
let node;
setTimeout(() => {
  node = spawn('node', ['--watch', '--enable-source-maps', 'dist/main.js'], { stdio: 'inherit' });
}, 4000);
process.on('SIGINT', () => {
  tsc.kill();
  node?.kill();
  process.exit(0);
});
