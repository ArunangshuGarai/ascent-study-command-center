import fs from 'node:fs';
import path from 'node:path';
import { app } from './app.js';
import { closeDb, databaseMode, initDb } from './db.js';

const PORT = Number(process.env.PORT) || 8787;
const DIST_DIR = path.join(process.cwd(), 'dist');

await initDb();

const server = app.listen(PORT, () => {
  console.log(`[ascent] API + app listening on http://localhost:${PORT} (${databaseMode()})`);
  if (!fs.existsSync(DIST_DIR)) {
    console.log('[ascent] dist/ not found — run `npm run build` for the production UI.');
  }
});

function shutdown() {
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
