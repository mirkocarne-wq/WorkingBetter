import { createDatabase } from '../client.js';
import { runMigrations } from '../migrate.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL non impostata');
const { db, close } = createDatabase({ url, max: 1 });
const done = await runMigrations(db);
console.log(done.length ? `Applicate ${done.length} migrazioni: ${done.join(', ')}` : 'Nessuna migrazione da applicare');
await close();
