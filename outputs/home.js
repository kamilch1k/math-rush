(function () {
  'use strict';
  const key = 'mathRushHomeLanguage';
  let language = 'ru';
  try { language = localStorage.getItem(key) === 'en' ? 'en' : 'ru'; } catch (_) { /* Default to Russian. */ }

  function translate(next) {
    language = next;
    document.documentElement.lang = next;
    document.querySelectorAll('[data-ru][data-en]').forEach(element => {
      element.textContent = element.dataset[next];
    });
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === next));
    });
    document.title = next === 'ru' ? 'Math Rush — открытый тренажёр математики' : 'Math Rush — open-source maths training';
    document.querySelector('meta[name="description"]').content = next === 'ru'
      ? 'Math Rush — открытый тренажёр математики с картой знаний, подсказками и сохранением прогресса. Код приложения доступен на GitHub по лицензии MIT.'
      : 'Math Rush — open-source maths training with a learning map, hints, and saved progress. Application source is available on GitHub under MIT.';
    try { localStorage.setItem(key, next); } catch (_) { /* The language still changes for this visit. */ }
  }

  document.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => translate(button.dataset.language));
  });
  translate(language);

  // Restore the server's HttpOnly session without storing login credentials.
  (async () => {
    try {
      const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !(await response.json()).user) return;
      document.querySelectorAll('a[href="workspace.html#auth"]').forEach(link => {
        link.setAttribute('href', 'workspace.html#today');
        const label = link.querySelector('[data-ru]') || link;
        label.dataset.ru = 'Мой кабинет';
        label.dataset.en = 'My workspace';
        label.textContent = label.dataset[language];
      });
    } catch (_) { /* Guest practice remains available offline and on static hosting. */ }
  })();
})();
