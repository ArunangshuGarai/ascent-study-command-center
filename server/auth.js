import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, pruneSessions, readStats } from './db.js';

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS) || 30);
const KEY_LENGTH = 64;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateRegistration({ name, email, password }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  if (cleanName.length < 2) return 'Tell us your name — at least 2 characters.';
  if (cleanName.length > 48) return 'Keep your name under 48 characters.';
  if (!EMAIL_RE.test(cleanEmail)) return 'That email address does not look right.';
  if (cleanEmail.length > 160) return 'That email address is too long.';
  if (typeof password !== 'string' || password.length < 8) {
    return 'Use a password of at least 8 characters.';
  }
  if (password.length > 200) return 'That password is too long.';
  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, salt, storedHash) {
  try {
    const derived = await scrypt(password, salt, KEY_LENGTH);
    const candidate = Buffer.from(derived);
    const expected = Buffer.from(storedHash, 'hex');
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  };
}

export function accountPayload(row) {
  return {
    user: publicUser(row),
    stats: readStats(row.id),
  };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId) {
  pruneSessions();
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hashToken(token), userId, now.toISOString(), expires.toISOString(), now.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

export function parseCookies(header) {
  const jar = {};
  if (!header) return jar;
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    try {
      jar[key] = decodeURIComponent(value);
    } catch {
      jar[key] = value;
    }
  });
  return jar;
}

export function sessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie).ascent_session;
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.id AS session_id, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(hashToken(token), new Date().toISOString());
  if (!row) return null;
  // Touch at most once per hour to keep writes cheap.
  const lastSeen = new Date().toISOString();
  db.prepare(`
    UPDATE sessions SET last_seen_at = ?
    WHERE id = ? AND last_seen_at < ?
  `).run(lastSeen, row.session_id, new Date(Date.now() - 3_600_000).toISOString());
  return row;
}

export function destroySession(req) {
  const token = parseCookies(req.headers.cookie).ascent_session;
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function sessionCookie(token, expiresAt, secure) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return [
    `ascent_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

export function clearSessionCookie() {
  return 'ascent_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(normalizeEmail(email));
}
