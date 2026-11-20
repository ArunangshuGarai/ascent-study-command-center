import fs from 'node:fs';
import path from 'node:path';

const remoteUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '';
const remoteToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '';
const isRemote = Boolean(remoteUrl);

export const TOTAL_TOPIC_UNITS = 209;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS planner_states (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    study_minutes INTEGER NOT NULL DEFAULT 0,
    coverage INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    mocks_taken INTEGER NOT NULL DEFAULT 0,
    mock_avg REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`;

let localDb = null;
let remoteClient = null;
let initPromise = null;

function toArgs(params = []) {
  return params.map((value) => (value === undefined ? null : value));
}

export function databaseMode() {
  return isRemote ? 'turso' : 'sqlite';
}

export function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (isRemote) {
      const { createClient } = await import('@libsql/client');
      remoteClient = createClient({
        url: remoteUrl,
        authToken: remoteToken || undefined,
      });
      await remoteClient.executeMultiple(SCHEMA);
      return;
    }

    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(process.cwd(), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const { DatabaseSync } = await import('node:sqlite');
    localDb = new DatabaseSync(path.join(dataDir, 'ascent.db'));
    localDb.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
    localDb.exec(SCHEMA);
  })();
  return initPromise;
}

export async function all(sql, params = []) {
  await initDb();
  if (remoteClient) {
    const result = await remoteClient.execute({ sql, args: toArgs(params) });
    return result.rows.map((row) => ({ ...row }));
  }
  return localDb.prepare(sql).all(...toArgs(params));
}

export async function get(sql, params = []) {
  await initDb();
  if (remoteClient) {
    const result = await remoteClient.execute({ sql, args: toArgs(params) });
    return result.rows[0] ? { ...result.rows[0] } : null;
  }
  return localDb.prepare(sql).get(...toArgs(params)) ?? null;
}

export async function run(sql, params = []) {
  await initDb();
  if (remoteClient) {
    const result = await remoteClient.execute({ sql, args: toArgs(params) });
    return {
      changes: result.rowsAffected ?? 0,
      lastInsertRowid: result.lastInsertRowid ?? null,
    };
  }
  return localDb.prepare(sql).run(...toArgs(params));
}

export function emptyStats() {
  return {
    xp: 0,
    completed: 0,
    studyMinutes: 0,
    coverage: 0,
    bestStreak: 0,
    mocksTaken: 0,
    mockAvg: 0,
    updatedAt: null,
  };
}

const STUDY_KINDS = new Set(['study', 'pyq', 'test', 'mock', 'analysis', 'revision', 'practice']);

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function minusDay(iso) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Derive a durable stats snapshot from a planner state. */
export function computeStats(state) {
  if (!state || !Array.isArray(state.tasks)) return emptyStats();
  const tasks = state.tasks.filter((task) => task && typeof task === 'object');
  const done = tasks.filter((task) => task.status === 'done');
  const xp = done.reduce((sum, task) => sum + (Number(task.xp) || 0), 0);
  const studyMinutes = done
    .filter((task) => STUDY_KINDS.has(task.kind))
    .reduce((sum, task) => sum + Math.max(0, Number(task.duration) || 0), 0);

  const covered = new Set();
  tasks.forEach((task) => {
    if (task.kind !== 'study' || !task.topicId) return;
    if (task.status !== 'done') return;
    covered.add(`${task.topicId}:${task.sessionNo ?? 1}`);
  });
  const coverage = Math.min(100, Math.round((covered.size / TOTAL_TOPIC_UNITS) * 100));

  const days = [...new Set(
    done
      .map((task) => String(task.completedAt || task.date || '').slice(0, 10))
      .filter(Boolean),
  )].sort();

  let bestStreak = 0;
  let run = 0;
  let previous = null;
  days.forEach((day) => {
    if (previous && minusDay(day) !== previous) run = 1;
    else run += 1;
    bestStreak = Math.max(bestStreak, run);
    previous = day;
  });

  const mocks = done.filter((task) => task.kind === 'mock' && Number.isFinite(Number(task.score)));
  const mockAvg = mocks.length
    ? Math.round(mocks.reduce((sum, task) => sum + Number(task.score), 0) / mocks.length)
    : 0;

  return {
    xp,
    completed: done.length,
    studyMinutes,
    coverage,
    bestStreak,
    mocksTaken: mocks.length,
    mockAvg,
    updatedAt: new Date().toISOString(),
    today: isoToday(),
  };
}

export async function readStats(userId) {
  const row = await get('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
  if (!row) return emptyStats();
  return {
    xp: row.xp,
    completed: row.completed,
    studyMinutes: row.study_minutes,
    coverage: row.coverage,
    bestStreak: row.best_streak,
    mocksTaken: row.mocks_taken,
    mockAvg: row.mock_avg,
    updatedAt: row.updated_at,
  };
}

export async function writeStats(userId, stats) {
  await run(`
    INSERT INTO user_stats (
      user_id, xp, completed, study_minutes, coverage,
      best_streak, mocks_taken, mock_avg, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      xp = excluded.xp,
      completed = excluded.completed,
      study_minutes = excluded.study_minutes,
      coverage = excluded.coverage,
      best_streak = excluded.best_streak,
      mocks_taken = excluded.mocks_taken,
      mock_avg = excluded.mock_avg,
      updated_at = excluded.updated_at
  `, [
    userId,
    stats.xp,
    stats.completed,
    stats.studyMinutes,
    stats.coverage,
    stats.bestStreak,
    stats.mocksTaken,
    stats.mockAvg,
    stats.updatedAt ?? new Date().toISOString(),
  ]);
}

export async function readPlanner(userId) {
  const row = await get(
    'SELECT state, revision, updated_at FROM planner_states WHERE user_id = ?',
    [userId],
  );
  if (!row || !row.state) return { state: null, revision: 0, updatedAt: null };
  try {
    return { state: JSON.parse(row.state), revision: row.revision, updatedAt: row.updated_at };
  } catch {
    return { state: null, revision: row.revision, updatedAt: row.updated_at };
  }
}

export async function writePlanner(userId, state) {
  const now = new Date().toISOString();
  const stats = computeStats(state);
  await run(`
    INSERT INTO planner_states (user_id, state, revision, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      state = excluded.state,
      revision = planner_states.revision + 1,
      updated_at = excluded.updated_at
  `, [userId, JSON.stringify(state), now]);
  await writeStats(userId, stats);
  const row = await get('SELECT revision FROM planner_states WHERE user_id = ?', [userId]);
  return { revision: row?.revision ?? 1, stats, updatedAt: now };
}

export async function pruneSessions() {
  const now = new Date().toISOString();
  await run('DELETE FROM sessions WHERE expires_at <= ?', [now]);
}

export async function closeDb() {
  if (remoteClient) {
    try {
      remoteClient.close();
    } catch {
      // ignore
    }
    remoteClient = null;
  }
  if (localDb) {
    try {
      localDb.close();
    } catch {
      // ignore
    }
    localDb = null;
  }
}
