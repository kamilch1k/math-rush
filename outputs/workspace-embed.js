(function (global) {
  'use strict';

  const document = global.document;
  const script = document.currentScript;
  const parameters = new URLSearchParams(global.location.search);
  let parentWindow = null;
  if (parameters.get('embedded') === '1') {
    try {
      const candidate = global.parent;
      if (candidate !== global && candidate.location.origin === global.location.origin &&
          candidate.MathRushProgress && candidate.MathRushCloud) parentWindow = candidate;
    } catch (_) { /* A cross-origin frame uses the standalone page instead. */ }
  }

  const embedded = Boolean(parentWindow);
  let language = null;
  if (embedded) {
    // Share the parent's exact instances. A second cloud client could restore an
    // older account or overwrite progress while the workspace changes accounts.
    global.MathRushProgress = parentWindow.MathRushProgress;
    global.MathRushCloud = parentWindow.MathRushCloud;
    const requested = parameters.get('language');
    language = ['ru', 'en'].includes(requested) ? requested
      : parentWindow.document.documentElement.lang === 'en' ? 'en' : 'ru';
    document.documentElement.classList.add('mathrush-embedded');
    document.documentElement.lang = language;
  }

  let disposed = false;
  let observer = null;
  let resizeFrame = null;
  let lastHeight = null;
  let resolveReady;
  const api = { embedded, language, ready: new Promise(resolve => { resolveReady = resolve; }) };
  global.MathRushEmbed = api;

  function reportHeight() {
    resizeFrame = null;
    if (disposed || !embedded || !document.body) return;
    const body = document.body.getBoundingClientRect();
    const main = document.querySelector('main')?.getBoundingClientRect();
    // Do not use documentElement.scrollHeight: the iframe's current viewport can
    // turn that measurement into an ever-growing resize feedback loop.
    const height = Math.max(1, Math.ceil(Math.max(body.height, main ? main.bottom - body.top : 0)));
    if (!Number.isFinite(height) || height === lastHeight) return;
    lastHeight = height;
    parentWindow.postMessage({ type: 'mathrush:embed-height', height }, global.location.origin);
  }

  function queueHeight() {
    if (disposed || !embedded || resizeFrame !== null) return;
    if (typeof global.requestAnimationFrame === 'function') resizeFrame = global.requestAnimationFrame(reportHeight);
    else reportHeight();
  }

  function forward(event) {
    if (disposed) return;
    global.dispatchEvent(new global.CustomEvent(event.type, { detail: event.detail }));
    queueHeight();
  }

  function navigate(event) {
    if (!embedded || event.defaultPrevented || (event.button !== undefined && event.button !== 0) ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    const href = link?.getAttribute('href');
    if (!href || href.startsWith('#') || link.hasAttribute('download')) return;
    const destination = new URL(href, global.location.href);
    if (destination.origin !== global.location.origin) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return;
    }
    const page = destination.pathname.split('/').at(-1);
    if (!page.endsWith('.html')) return;
    event.preventDefault();
    if (page === 'multiplication.html' || page === 'learn.html') {
      parentWindow.location.hash = page === 'multiplication.html' ? 'tables' : 'learning';
    } else {
      // Existing archive/topic links stay useful without nesting another site's
      // navigation inside the workspace frame.
      parentWindow.location.assign(destination.href);
    }
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    if (embedded) {
      parentWindow.removeEventListener('mathrush:progress', forward);
      parentWindow.removeEventListener('mathrush:cloud', forward);
      global.removeEventListener('resize', queueHeight);
      document.removeEventListener('click', navigate);
    }
    observer?.disconnect();
    if (resizeFrame !== null && typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
  }

  function loadScript(source) {
    if (disposed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = source;
      element.async = false;
      element.onload = resolve;
      element.onerror = () => reject(new Error('Practice files are unavailable.'));
      document.head.appendChild(element);
    });
  }

  async function start() {
    const main = document.querySelector('main');
    if (embedded) {
      if (main) main.inert = true;
      parentWindow.addEventListener('mathrush:progress', forward);
      parentWindow.addEventListener('mathrush:cloud', forward);
      global.addEventListener('resize', queueHeight);
      document.addEventListener('click', navigate);
      if (typeof global.ResizeObserver === 'function' && document.body) {
        observer = new global.ResizeObserver(queueHeight);
        observer.observe(document.body);
      }
    }
    try {
      if (script?.dataset.app === 'multiplication') {
        const files = embedded
          ? ['multiplication-core.js', 'multiplication.js']
          : ['progress.js', 'cloud-progress.js', 'legacy-cloud.js', 'multiplication-core.js', 'multiplication.js'];
        for (const file of files) await loadScript(file);
      }
      await Promise.resolve(global.MathRushCloud?.ready);
    } catch (_) {
      if (!disposed && main) {
        const notice = document.createElement('p');
        notice.setAttribute('role', 'status');
        notice.textContent = language === 'en'
          ? 'This practice page could not open. Reload the page to try again.'
          : 'Не удалось открыть тренажёр. Обнови страницу, чтобы попробовать снова.';
        main.appendChild(notice);
      }
    } finally {
      if (!disposed) {
        if (main) main.inert = false;
        queueHeight();
      }
      resolveReady({ embedded, language });
    }
  }

  global.addEventListener('pagehide', cleanup, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else void start();
})(window);
