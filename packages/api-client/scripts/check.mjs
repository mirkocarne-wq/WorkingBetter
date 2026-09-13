// Verifica che src/schema.ts sia allineato a openapi.json (usato in CI: `pnpm --filter @wb/api-client check`).
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = join(tmpdir(), `wb-schema-${process.pid}.ts`);
execFileSync('pnpm', ['exec', 'openapi-typescript', 'openapi.json', '-o', tmp, '--alphabetize', '--empty-objects-unknown'], { stdio: 'inherit' });
const fresh = readFileSync(tmp, 'utf8');
rmSync(tmp, { force: true });
const committed = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
if (fresh !== committed) {
  console.error('[api-client] src/schema.ts non è aggiornato: esegui `pnpm --filter @wb/api openapi:emit && pnpm --filter @wb/api-client generate` e committa.');
  process.exit(1);
}
console.log('[api-client] schema.ts allineato a openapi.json');
