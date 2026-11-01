export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(value, status = 200, headers = {}) {
  return Response.json({ ok: true, ...value }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      ...headers
    }
  });
}

export async function body(request, maxBytes = 262144) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Send application/json.');
  }
  const size = Number(request.headers.get('content-length') || 0);
  if (size > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'The request is too large.');
  if (!request.body) throw new HttpError(400, 'INVALID_JSON', 'A JSON object is required.');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'BODY_TOO_LARGE', 'The request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'A JSON object is required.');
  }
}

export function text(value, field, max, min = 0) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} must be between ${min} and ${max} characters.`);
  }
  return value.trim();
}

export function integer(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

export function sameOrigin(request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new HttpError(403, 'ORIGIN_REJECTED', 'Open Math Rush on this site before making changes.');
    }
  }
}

export async function all(db, sql, ...args) {
  return (await db.prepare(sql).bind(...args).all()).results;
}

export async function rate(env, key, limit, seconds) {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / seconds);
  const result = await env.DB.prepare(`
    INSERT INTO rate_limits (key, slot, count, expires_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(key, slot) DO UPDATE SET count = count + 1 WHERE count < ?
    RETURNING count
  `).bind(key, slot, (slot + 2) * seconds, limit).first();
  if (!result) throw new HttpError(429, 'RATE_LIMITED', 'Please wait before trying again.', { retryAfter: seconds - now % seconds });
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();
}

export function requireTutor(user) {
  if (user.role !== 'tutor') throw new HttpError(403, 'TUTOR_REQUIRED', 'This action is for an approved tutor.');
}

export const nowIso = () => new Date().toISOString();
export const TOPICS = ['fractions', 'equations', 'percentages'];

export function topic(value) {
  if (!TOPICS.includes(value)) throw new HttpError(400, 'INVALID_TOPIC', 'Choose fractions, equations, or percentages.');
  return value;
}
