import { activateTutor, currentUser, handleAuth, patchProfile, requireUser, userView } from './auth.js';
import { assignments, classroom, createAssignment, createReview, joinClassroom, reviewFeedback, reviews, tutors } from './classroom.js';
import { HttpError, json, sameOrigin } from './http.js';
import { answer, dashboard, hint, problem } from './practice.js';
import { getProgress, putProgress } from './progress.js';

const PAGE_ROUTES = {
  '/': '/math-rush.html',
  '/learn': '/learn.html',
  '/materials': '/learn.html',
  '/multiplication': '/multiplication.html',
  '/dashboard': '/workspace.html',
  '/tutors': '/workspace.html',
  '/workspace': '/workspace.html',
  '/quizzes': '/math-rush.html',
  '/map': '/math-map.html',
  '/profile': '/profile.html',
  '/settings': '/settings.html',
  '/derivatives': '/derivatives.html',
  '/runner': '/runner.html'
};

async function api(request, env, url) {
  const path = url.pathname;
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new HttpError(426, 'HTTPS_REQUIRED', 'Use the secure HTTPS address for Math Rush.');
  }
  if (path === '/api/health' && request.method === 'GET') return json({ service: 'math-rush' });
  if (path === '/api/capabilities' && request.method === 'GET') {
    return json({ database: Boolean(env.DB), ai: Boolean(env.AI && env.AI_MODEL), tutorInvites: Boolean(env.TUTOR_INVITE_CODE) });
  }
  if (path === '/api/check-handwriting') {
    throw new HttpError(503, 'RECOGNITION_NOT_CONFIGURED', 'Handwriting recognition is not configured.');
  }
  sameOrigin(request);
  if (!env.DB) throw new HttpError(503, 'DATABASE_NOT_CONFIGURED', 'Accounts are not available on this host. Existing practice still works on this device.');
  const authentication = await handleAuth(path, env, request);
  if (authentication) return authentication;
  if (path === '/api/me' && request.method === 'GET') {
    const user = await currentUser(env, request);
    return json({ user: user ? userView(user) : null });
  }
  if (path === '/api/tutors' && request.method === 'GET') return tutors(env);
  const user = await requireUser(env, request);
  const method = request.method;
  if (path === '/api/profile' && method === 'PATCH') return patchProfile(env, request, user);
  if (path === '/api/tutor/activate' && method === 'POST') return activateTutor(env, request, user);
  if (path === '/api/progress' && method === 'GET') return getProgress(env, user);
  if (path === '/api/progress' && method === 'PUT') return putProgress(env, request, user);
  if (path === '/api/classroom' && method === 'GET') return classroom(env, user);
  if (path === '/api/classroom/join' && method === 'POST') return joinClassroom(env, request, user);
  if (path === '/api/assignments' && method === 'GET') return assignments(env, user);
  if (path === '/api/assignments' && method === 'POST') return createAssignment(env, request, user);
  if (path === '/api/reviews' && method === 'GET') return reviews(env, user);
  if (path === '/api/reviews' && method === 'POST') return createReview(env, request, user);
  if (/^\/api\/reviews\/[a-f0-9-]{36}$/.test(path) && method === 'PATCH') return reviewFeedback(env, request, user, path.split('/').at(-1));
  if (path === '/api/practice/problem' && method === 'GET') return problem(env, request, user);
  if (path === '/api/practice/answer' && method === 'POST') return answer(env, request, user);
  if (path === '/api/practice/hint' && method === 'POST') return hint(env, request, user);
  if (path === '/api/dashboard' && method === 'GET') return dashboard(env, user);
  throw new HttpError(404, 'NOT_FOUND', 'That API endpoint was not found.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url);
      if (PAGE_ROUTES[url.pathname]) url.pathname = PAGE_ROUTES[url.pathname];
      const response = await env.ASSETS.fetch(new Request(url, request));
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'same-origin');
      headers.set('X-Frame-Options', 'DENY');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      if (error instanceof HttpError) {
        const headers = error.status === 429 ? { 'Retry-After': String(error.extra.retryAfter || 60) } : {};
        return json({ ok: false, code: error.code, message: error.message, ...error.extra }, error.status, headers);
      }
      // Log a request identifier and path, never credentials, questions, or database errors.
      const requestId = crypto.randomUUID();
      console.error(JSON.stringify({ event: 'request_failed', requestId, path: url.pathname }));
      return json({ ok: false, code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId }, 500);
    }
  }
};
