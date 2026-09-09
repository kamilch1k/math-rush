const PAGE_ROUTES = {
  '/': '/math-rush.html',
  '/quizzes': '/math-rush.html',
  '/map': '/math-map.html',
  '/profile': '/profile.html',
  '/settings': '/settings.html',
  '/derivatives': '/derivatives.html'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'math-rush' });
    }
    if (url.pathname === '/api/check-handwriting') {
      return Response.json({
        ok: false,
        code: 'RECOGNITION_NOT_CONFIGURED',
        message: 'Распознавание рисунка будет подключено на следующем этапе.'
      }, { status: 503 });
    }
    if (PAGE_ROUTES[url.pathname]) {
      url.pathname = PAGE_ROUTES[url.pathname];
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  }
};
