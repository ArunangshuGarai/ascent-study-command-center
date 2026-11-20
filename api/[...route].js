import { app } from '../server/app.js';
import { initDb } from '../server/db.js';

// Vercel starts a fresh function instance often, so keep the schema check
// behind a single module-level promise.
const ready = initDb();

export default async function handler(req, res) {
  await ready;
  return app(req, res);
}
