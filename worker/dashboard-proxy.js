const RELEASE = '4506679';
const RAW_ROOT = `https://raw.githubusercontent.com/kamilch1k/math-rush/${RELEASE}/outputs`;

const ROUTES = {
  '/': 'math-rush.html',
  '/quizzes': 'math-rush.html',
  '/math-rush.html': 'math-rush.html',
  '/outputs/math-rush.html': 'math-rush.html',
  '/map': 'math-map.html',
  '/math-map.html': 'math-map.html',
  '/outputs/math-map.html': 'math-map.html',
  '/profile': 'profile.html',
  '/profile.html': 'profile.html',
  '/outputs/profile.html': 'profile.html',
  '/settings': 'settings.html',
  '/settings.html': 'settings.html',
  '/outputs/settings.html': 'settings.html',
  '/derivatives': 'derivatives.html',
  '/derivatives.html': 'derivatives.html',
  '/outputs/derivatives.html': 'derivatives.html',
  '/app-shell.css': 'app-shell.css',
  '/outputs/app-shell.css': 'app-shell.css',
  '/progress.js': 'progress.js',
  '/outputs/progress.js': 'progress.js',
  '/derivatives.js': 'derivatives.js',
  '/outputs/derivatives.js': 'derivatives.js'
};

const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8'
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'math-rush', release: RELEASE });
    }
    if (url.pathname === '/api/check-handwriting') {
      return Response.json({ ok: false, code: 'RECOGNITION_NOT_CONFIGURED' }, { status: 503 });
    }
    const file = ROUTES[url.pathname];
    if (!file) return new Response('Not found', { status: 404 });
    const upstream = await fetch(`${RAW_ROOT}/${file}`, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!upstream.ok) return new Response('Site asset unavailable', { status: 502 });
    const extension = file.split('.').pop();
    // Do not forward GitHub Raw's CSP/sandbox headers. They are intended for
    // raw file previews and would disable this site's inline JavaScript.
    const headers = new Headers();
    headers.set('content-type', CONTENT_TYPES[extension] || 'application/octet-stream');
    headers.set('cache-control', extension === 'html' ? 'public, max-age=60' : 'public, max-age=300');
    headers.set('x-math-rush-release', RELEASE);
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
