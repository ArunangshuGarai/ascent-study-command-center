import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required');
  process.exit(1);
}

const dbPath = path.resolve('data/ascent.db');
if (!fs.existsSync(dbPath)) {
  console.error('local database missing:', dbPath);
  process.exit(1);
}

const local = new DatabaseSync(dbPath, { readOnly: true });
const remote = createClient({ url, authToken });

const users = local.prepare('SELECT * FROM users ORDER BY created_at').all();
const planners = new Map(
  local.prepare('SELECT * FROM planner_states').all().map((row) => [row.user_id, row]),
);
const stats = new Map(
  local.prepare('SELECT * FROM user_stats').all().map((row) => [row.user_id, row]),
);

const deletes = [
  'DELETE FROM sessions WHERE user_id = ?',
  'DELETE FROM planner_states WHERE user_id = ?',
  'DELETE FROM user_stats WHERE user_id = ?',
  'DELETE FROM users WHERE id = ?',
];

let migrated = 0;
let plannerBytes = 0;

for (const user of users) {
  const existing = await remote.execute({
    sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE',
    args: [user.email],
  });
  const priorId = existing.rows[0]?.id;
  for (const id of new Set([priorId, user.id].filter(Boolean))) {
    for (const sql of deletes) await remote.execute({ sql, args: [id] });
  }

  await remote.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, password_salt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      user.name,
      user.email,
      user.password_hash,
      user.password_salt,
      user.created_at,
      user.updated_at,
    ],
  });

  const planner = planners.get(user.id);
  if (planner) {
    await remote.execute({
      sql: `INSERT INTO planner_states (user_id, state, revision, updated_at)
            VALUES (?, ?, ?, ?)`,
      args: [user.id, planner.state ?? null, planner.revision ?? 0, planner.updated_at],
    });
    plannerBytes += planner.state ? planner.state.length : 0;
  }

  const snapshot = stats.get(user.id);
  if (snapshot) {
    await remote.execute({
      sql: `INSERT INTO user_stats (
              user_id, xp, completed, study_minutes, coverage,
              best_streak, mocks_taken, mock_avg, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        snapshot.user_id,
        snapshot.xp,
        snapshot.completed,
        snapshot.study_minutes,
        snapshot.coverage,
        snapshot.best_streak,
        snapshot.mocks_taken,
        snapshot.mock_avg,
        snapshot.updated_at,
      ],
    });
  }

  migrated += 1;
  console.log(`migrated ${user.email} (rev ${planner?.revision ?? 0})`);
}

// Clean up the live smoke-test account created during deployment checks.
const testUsers = await remote.execute({
  sql: "SELECT id FROM users WHERE email LIKE 'live-test-%'",
  args: [],
});
for (const row of testUsers.rows) {
  for (const sql of deletes) await remote.execute({ sql, args: [row.id] });
  console.log('removed smoke-test account', row.id);
}

const counts = await remote.execute({
  sql: `SELECT (SELECT COUNT(*) FROM users) AS users,
               (SELECT COUNT(*) FROM planner_states) AS planners,
               (SELECT COUNT(*) FROM user_stats) AS stats`,
  args: [],
});
console.log('remote counts', counts.rows[0]);
console.log('migrated users', migrated, 'planner payload bytes', plannerBytes);

local.close();
remote.close();
