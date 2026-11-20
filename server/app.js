import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  accountPayload,
  clearSessionCookie,
  createSession,
  destroySession,
  findUserByEmail,
  hashPassword,
  normalizeEmail,
  publicUser,
  sessionCookie,
  sessionFromRequest,
  validateRegistration,
  verifyPassword,
} from './auth.js';
import {
  all,
  databaseMode,
  emptyStats,
  get,
  readPlanner,
  readStats,
  run,
  writePlanner,
  writeStats,
} from './db.js';

export const app = express();
const DIST_DIR = path.join(process.cwd(), 'dist');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

const attempts = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.reset < now) {
    attempts.set(key, { count: 1, reset: now + 10 * 60_000 });
    return next();
  }
  record.count += 1;
  if (record.count > 30) {
    return res.status(429).json({
      error: 'Too many attempts. Take a breath, then try again in a few minutes.',
    });
  }
  next();
}

function secureCookie(req) {
  if (process.env.COOKIE_SECURE === '1') return true;
  if (process.env.COOKIE_SECURE === '0') return false;
  if (process.env.VERCEL) return true;
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

async function plannerPayload(userId) {
  return readPlanner(userId);
}

function userName(state, fallback) {
  const name = String(state?.profile?.name || '').trim().slice(0, 48);
  return name || fallback;
}

function isValidPlannerState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!state.profile || typeof state.profile !== 'object') return false;
  if (!state.settings || typeof state.settings !== 'object') return false;
  if (!Array.isArray(state.tasks)) return false;
  if (state.tasks.length > 12_000) return false;
  return true;
}

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'ascent-gate-command-center',
    database: databaseMode(),
    time: new Date().toISOString(),
    debug: {
      url: req.url,
      originalUrl: req.originalUrl,
      vercel: Object.fromEntries(
        Object.entries(req.headers).filter(([key]) => key.startsWith('x-vercel')),
      ),
    },
  });
});

app.post('/api/auth/register', rateLimit, asyncRoute(async (req, res) => {
  const { name, email, password } = req.body ?? {};
  const error = validateRegistration({ name, email, password });
  if (error) return res.status(400).json({ error });

  const cleanEmail = normalizeEmail(email);
  if (await findUserByEmail(cleanEmail)) {
    return res.status(409).json({
      error: 'An account with that email already exists. Sign in instead.',
      field: 'email',
    });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const cleanName = String(name).trim();
  const { hash, salt } = await hashPassword(password);

  try {
    await run(`
      INSERT INTO users (id, name, email, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, cleanName, cleanEmail, hash, salt, now, now]);
    await run(`
      INSERT INTO planner_states (user_id, state, revision, updated_at)
      VALUES (?, NULL, 0, ?)
    `, [id, now]);
    await writeStats(id, { ...emptyStats(), updatedAt: now });
  } catch (error_) {
    if (String(error_.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    throw error_;
  }

  const session = await createSession(id);
  res.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt, secureCookie(req)));
  const row = await get('SELECT * FROM users WHERE id = ?', [id]);
  res.status(201).json({
    ...(await accountPayload(row)),
    planner: { state: null, revision: 0, updatedAt: null },
  });
}));

app.post('/api/auth/login', rateLimit, asyncRoute(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  const row = await findUserByEmail(email);
  const valid = row ? await verifyPassword(String(password), row.password_salt, row.password_hash) : false;
  if (!row || !valid) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  const session = await createSession(row.id);
  res.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt, secureCookie(req)));
  res.json({
    ...(await accountPayload(row)),
    planner: await plannerPayload(row.id),
  });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  await destroySession(req);
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
}));

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  const row = await sessionFromRequest(req);
  if (!row) return res.status(401).json({ error: 'Not signed in.' });
  res.json({
    ...(await accountPayload(row)),
    planner: await plannerPayload(row.id),
  });
}));

app.get('/api/planner', asyncRoute(async (req, res) => {
  const row = await sessionFromRequest(req);
  if (!row) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ planner: await plannerPayload(row.id), stats: await readStats(row.id) });
}));

app.put('/api/planner', asyncRoute(async (req, res) => {
  const row = await sessionFromRequest(req);
  if (!row) return res.status(401).json({ error: 'Not signed in.' });

  const state = req.body?.state;
  if (!isValidPlannerState(state)) {
    return res.status(400).json({ error: 'That planner payload is not valid.' });
  }

  const result = await writePlanner(row.id, state);
  const name = userName(state, row.name);
  if (name !== row.name) {
    await run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [
      name,
      new Date().toISOString(),
      row.id,
    ]);
    row.name = name;
  }
  res.json({
    revision: result.revision,
    stats: result.stats,
    updatedAt: result.updatedAt,
    user: publicUser(row),
  });
}));

app.get('/api/stats', asyncRoute(async (req, res) => {
  const row = await sessionFromRequest(req);
  if (!row) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ stats: await readStats(row.id) });
}));

app.get('/api/leaderboard', asyncRoute(async (req, res) => {
  const row = await sessionFromRequest(req);
  if (!row) return res.status(401).json({ error: 'Not signed in.' });
  const entries = await all(`
    SELECT u.id, u.name, s.xp, s.completed, s.study_minutes, s.coverage, s.best_streak, s.mock_avg
    FROM user_stats s
    JOIN users u ON u.id = s.user_id
    WHERE s.xp > 0
    ORDER BY s.xp DESC, s.completed DESC
    LIMIT 10
  `);
  const leaders = entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    xp: entry.xp,
    completed: entry.completed,
    studyMinutes: entry.study_minutes,
    coverage: entry.coverage,
    bestStreak: entry.best_streak,
    mockAvg: entry.mock_avg,
    you: entry.id === row.id,
  }));
  res.json({ leaders });
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'That API route does not exist.' });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      if (filePath.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).send(
      '<body style="background:#07080b;color:#d8ff6a;font-family:system-ui;padding:40px">'
      + '<h1>ASCENT API is running.</h1>'
      + '<p style="color:#c8cbc3">Build the client with <code>npm run build</code>, then restart to serve the app.</p>'
      + '</body>',
    );
  });
}

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That payload is too large.' });
  }
  console.error('[ascent]', error);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});
