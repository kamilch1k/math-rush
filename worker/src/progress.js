import { HttpError, body, integer, json, nowIso } from './http.js';

const identifier = /^[a-z0-9][a-z0-9-]{0,63}$/;

function number(value, max = 100000000) {
  if (!Number.isFinite(value) || value < 0 || value > max) throw new HttpError(400, 'INVALID_PROGRESS', 'Progress contains an invalid number.');
  return value;
}

function date(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 32 || !Number.isFinite(Date.parse(value))) {
    throw new HttpError(400, 'INVALID_PROGRESS', 'Progress contains an invalid date.');
  }
  return value;
}

function attempt(value) {
  if (!value || typeof value !== 'object' || !identifier.test(value.skillId || '') || typeof value.isCorrect !== 'boolean') {
    throw new HttpError(400, 'INVALID_PROGRESS', 'Progress contains an invalid attempt.');
  }
  const problemType = value.problemType || value.skillId;
  if (!identifier.test(problemType)) throw new HttpError(400, 'INVALID_PROGRESS', 'Progress contains an invalid exercise.');
  if (!['simple', 'advanced', 'expert'].includes(value.difficulty || 'simple')) {
    throw new HttpError(400, 'INVALID_PROGRESS', 'Progress contains an invalid difficulty.');
  }
  return { skillId: value.skillId, problemType, isCorrect: value.isCorrect,
    duration: number(value.duration || 0, 86400000), difficulty: value.difficulty || 'simple',
    xp: number(value.xp || 0, 1000), createdAt: date(value.createdAt) };
}

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 2) {
    throw new HttpError(400, 'INVALID_PROGRESS', 'Use Math Rush progress version 2.');
  }
  if (!Array.isArray(value.attempts) || value.attempts.length > 500 || !value.skills || typeof value.skills !== 'object' || Array.isArray(value.skills)) {
    throw new HttpError(400, 'INVALID_PROGRESS', 'Progress history is too large or invalid.');
  }
  const skills = Object.entries(value.skills);
  if (skills.length > 100) throw new HttpError(400, 'INVALID_PROGRESS', 'Too many skills in progress.');
  const cleanSkills = Object.create(null);
  for (const [id, summary] of skills) {
    if (!identifier.test(id) || !summary || typeof summary !== 'object' || Array.isArray(summary)) {
      throw new HttpError(400, 'INVALID_PROGRESS', 'Progress contains an invalid skill.');
    }
    const clean = { xp: number(summary.xp || 0), attempts: number(summary.attempts || 0, 10000000),
      correctAttempts: number(summary.correctAttempts || 0, 10000000), lastPracticedAt: date(summary.lastPracticedAt) };
    if (clean.correctAttempts > clean.attempts) throw new HttpError(400, 'INVALID_PROGRESS', 'Correct attempts cannot exceed attempts.');
    if (summary.recentAttempts !== undefined) {
      if (!Array.isArray(summary.recentAttempts) || summary.recentAttempts.length > 20) throw new HttpError(400, 'INVALID_PROGRESS', 'Recent history is too large.');
      clean.recentAttempts = summary.recentAttempts.map(item => attempt({ ...item, skillId: id }));
    }
    cleanSkills[id] = clean;
  }
  const result = { version: 2, totalXp: number(value.totalXp || 0), attempts: value.attempts.map(attempt), skills: cleanSkills,
    streakDays: number(value.streakDays || 0, 100000), lastActiveDate: date(value.lastActiveDate) };
  if (JSON.stringify(result).length > 220000) throw new HttpError(413, 'BODY_TOO_LARGE', 'Progress is too large to sync.');
  return result;
}

async function state(env, id) {
  const row = await env.DB.prepare('SELECT data,revision FROM progress WHERE user_id=?').bind(id).first();
  return { progress: row ? JSON.parse(row.data) : null, revision: row?.revision || 0 };
}

export async function getProgress(env, user) {
  return json(await state(env, user.id));
}

export async function putProgress(env, request, user) {
  const input = await body(request);
  const revision = integer(input.revision, 'Progress revision', 0, Number.MAX_SAFE_INTEGER - 1);
  const progress = validate(input.progress);
  const updated = revision === 0
    ? await env.DB.prepare('INSERT OR IGNORE INTO progress (user_id,data,revision,updated_at) VALUES (?,?,1,?) RETURNING revision')
      .bind(user.id, JSON.stringify(progress), nowIso()).first()
    : await env.DB.prepare('UPDATE progress SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? RETURNING revision')
      .bind(JSON.stringify(progress), nowIso(), user.id, revision).first();
  if (!updated) throw new HttpError(409, 'PROGRESS_CONFLICT', 'Progress changed on another device. Reload before replacing it.', await state(env, user.id));
  return json({ progress, revision: updated.revision });
}
