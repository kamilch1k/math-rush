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
    document.title = next === 'ru' ? 'Math Rush — математика, которая складывается' : 'Math Rush — make sense of mathematics';
    document.querySelector('meta[name="description"]').content = next === 'ru'
      ? 'Math Rush — практика математики, подсказки и письменная обратная связь преподавателя. Учись в своём темпе и сохраняй прогресс.'
      : 'Math Rush — maths practice, helpful hints, and written tutor feedback. Learn at your own pace and save your progress.';
    try { localStorage.setItem(key, next); } catch (_) { /* The language still changes for this visit. */ }
  }

  document.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => translate(button.dataset.language));
  });
  translate(language);
})();
