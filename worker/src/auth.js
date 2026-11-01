import { HttpError, body, json, nowIso, rate, text } from './http.js';

const ENCODER = new TextEncoder();
const ITERATIONS = 100000;
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function token(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', ENCODER.encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function safeEqual(provided, expected) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', ENCODER.encode(provided)),
    crypto.subtle.digest('SHA-256', ENCODER.encode(expected))
  ]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(a, b);
  // The Web Crypto HMAC verifier supplies a constant-time comparison in Node tests too.
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, b);
  return crypto.subtle.verify('HMAC', key, signature, a);
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', ENCODER.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: ENCODER.encode(salt),
    iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

function username(value) {
  const name = text(value, 'Username', 32, 3).toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{2,31}$/.test(name)) {
    throw new HttpError(400, 'INVALID_USERNAME', 'Use 3–32 letters, numbers, dots, underscores, or hyphens; start with a letter.');
  }
  return name;
}

function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'Use a passphrase of 12–128 characters.');
  }
  return value;
}

export function userView(row) {
  return {
    id: row.id, username: row.username, displayName: row.display_name,
    role: row.role, goal: row.goal, bio: row.bio, languages: JSON.parse(row.languages),
    publicProfile: Boolean(row.public_profile), createdAt: row.created_at
  };
}

function sessionToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const value = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('mr_session='))?.slice(11);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

function cookie(value, request, seconds = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `mr_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure}`;
}

async function session(env, request, user) {
  const value = token();
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  // A recovery may run while a password derivation is in flight. Mint only if
  // the credential verified by this request is still the current credential.
  const inserted = await env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at)
    SELECT ?,id,? FROM users WHERE id=? AND password_hash=? AND password_salt=? RETURNING token_hash`)
    .bind(await digest(value), expires, user.id, user.password_hash, user.password_salt).first();
  if (!inserted) throw new HttpError(401, 'CREDENTIALS_CHANGED', 'Your passphrase changed. Please sign in again.');
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)).run();
  return cookie(value, request);
}

export async function currentUser(env, request) {
  const value = sessionToken(request);
  if (!value) return null;
  return env.DB.prepare(`SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await digest(value), Math.floor(Date.now() / 1000)).first();
}

export async function requireUser(env, request) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in to your Math Rush account.');
  await rate(env, `account:${user.id}`, 180, 60);
  return user;
}

async function authRate(env, request, kind, name = '') {
  const ip = await digest(request.headers.get('CF-Connecting-IP') || 'local');
  await rate(env, `auth:${kind}:ip:${ip}`, kind === 'register' ? 10 : 60, 3600);
  if (name) await rate(env, `auth:${kind}:name:${await digest(name)}`, 8, 900);
}

async function register(env, request) {
  const input = await body(request, 4096);
  const name = username(input.username);
  const pass = password(input.password);
  const displayName = text(input.displayName || name, 'Display name', 60, 1);
  await authRate(env, request, 'register');
  const id = crypto.randomUUID();
  const salt = token(16);
  const recoveryCode = token(24);
  const hash = await passwordHash(pass, salt);
  try {
    await env.DB.prepare(`INSERT INTO users
      (id, username, display_name, password_hash, password_salt, recovery_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, name, displayName, hash, salt, await digest(recoveryCode), nowIso()).run();
  } catch (error) {
    if (/UNIQUE constraint/i.test(String(error))) throw new HttpError(409, 'USERNAME_TAKEN', 'That username is already in use.');
    throw error;
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ user: userView(user), recoveryCode }, 201, { 'Set-Cookie': await session(env, request, user) });
}

async function login(env, request) {
  const input = await body(request, 4096);
  const name = username(input.username);
  const pass = password(input.password);
  await authRate(env, request, 'login', name);
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(name).first();
  const hash = await passwordHash(pass, user?.password_salt || '00000000000000000000000000000000');
  const valid = await safeEqual(hash, user?.password_hash || 'invalid-account-hash');
  if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'The username or passphrase is incorrect.');
  return json({ user: userView(user) }, 200, { 'Set-Cookie': await session(env, request, user) });
}

async function recover(env, request) {
  const input = await body(request, 4096);
  const name = username(input.username);
  const pass = password(input.password);
  const supplied = text(input.recoveryCode, 'Recovery code', 100, 1);
  await authRate(env, request, 'recover', name);
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(name).first();
  const providedHash = await digest(supplied);
  const valid = await safeEqual(providedHash, user?.recovery_hash || 'invalid-recovery-hash');
  if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'The username or recovery code is incorrect.');
  const recoveryCode = token(24);
  const salt = token(16);
  const recoveryHash = await digest(recoveryCode);
  const hash = await passwordHash(pass, salt);
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,recovery_hash=?
      WHERE id=? AND recovery_hash=? RETURNING id`).bind(hash, salt, recoveryHash, user.id, user.recovery_hash),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS
      (SELECT 1 FROM users WHERE id=? AND recovery_hash=?)`).bind(user.id, user.id, recoveryHash)
  ]);
  if (!results[0].results?.length) throw new HttpError(409, 'RECOVERY_USED', 'This recovery code has already been used.');
  const updated = { ...user, password_hash: hash, password_salt: salt, recovery_hash: recoveryHash };
  return json({ user: userView(updated), recoveryCode }, 200, { 'Set-Cookie': await session(env, request, updated) });
}

export async function handleAuth(path, env, request) {
  if (path === '/api/auth/register' && request.method === 'POST') return register(env, request);
  if (path === '/api/auth/login' && request.method === 'POST') return login(env, request);
  if (path === '/api/auth/recover' && request.method === 'POST') return recover(env, request);
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const value = sessionToken(request);
    if (value) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(value)).run();
    return json({}, 200, { 'Set-Cookie': cookie('', request, 0) });
  }
  return null;
}

export async function patchProfile(env, request, user) {
  const input = await body(request, 8192);
  const displayName = input.displayName === undefined ? user.display_name : text(input.displayName, 'Display name', 60, 1);
  const goal = input.goal === undefined ? user.goal : text(input.goal, 'Learning goal', 300);
  const bio = input.bio === undefined ? user.bio : text(input.bio, 'Bio', 1200);
  let languages = JSON.parse(user.languages);
  if (input.languages !== undefined) {
    if (!Array.isArray(input.languages) || input.languages.length > 5) throw new HttpError(400, 'INVALID_INPUT', 'Choose up to five languages.');
    languages = input.languages.map(value => text(value, 'Language', 40, 1));
  }
  if (input.publicProfile !== undefined && typeof input.publicProfile !== 'boolean') throw new HttpError(400, 'INVALID_INPUT', 'Public profile must be true or false.');
  const publicProfile = user.role === 'tutor' ? Number(input.publicProfile ?? Boolean(user.public_profile)) : 0;
  await env.DB.prepare('UPDATE users SET display_name=?, goal=?, bio=?, languages=?, public_profile=? WHERE id=?')
    .bind(displayName, goal, bio, JSON.stringify(languages), publicProfile, user.id).run();
  const updated = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  return json({ user: userView(updated) });
}

export async function ensureClassroom(env, user) {
  await env.DB.prepare(`INSERT OR IGNORE INTO classrooms (id,tutor_id,title,code,created_at) VALUES (?,?,?,?,?)`)
    .bind(crypto.randomUUID(), user.id, `${user.display_name}'s classroom`, token(16), nowIso()).run();
  const row = await env.DB.prepare('SELECT * FROM classrooms WHERE tutor_id=?').bind(user.id).first();
  return { id: row.id, title: row.title, code: row.code, tutorId: user.id, tutorName: user.display_name };
}

export async function activateTutor(env, request, user) {
  await rate(env, `tutor-activate:${user.id}`, 5, 3600);
  const input = await body(request, 4096);
  if (!env.TUTOR_INVITE_CODE || !await safeEqual(text(input.inviteCode, 'Invite code', 256, 1), env.TUTOR_INVITE_CODE)) {
    throw new HttpError(403, 'INVALID_INVITE', 'A valid tutor invitation is required.');
  }
  await env.DB.prepare("UPDATE users SET role='tutor' WHERE id=?").bind(user.id).run();
  user.role = 'tutor';
  return json({ user: userView(user), classroom: await ensureClassroom(env, user) });
}
