(function () {
  'use strict';

  const preference = 'mathRushHomeLanguage';
  const embedded = window.MathRushEmbed?.embedded;
  let language = embedded ? window.MathRushEmbed.language : 'ru';
  try { if (!embedded) language = localStorage.getItem(preference) === 'en' ? 'en' : 'ru'; }
  catch (_) { /* Reading preferences is optional. */ }

  function setLanguage(next) {
    if (next !== 'ru' && next !== 'en') return;
    language = next;
    document.documentElement.lang = next;
    document.querySelectorAll('[data-ru][data-en]').forEach(element => {
      element.textContent = element.dataset[next];
    });
    document.querySelectorAll('[data-aria-ru][data-aria-en]').forEach(element => {
      element.setAttribute('aria-label', next === 'ru' ? element.dataset.ariaRu : element.dataset.ariaEn);
    });
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === next));
    });
    document.title = next === 'ru'
      ? 'Как учить таблицу умножения — Math Rush'
      : 'How to learn times tables — Math Rush';
    document.querySelector('meta[name="description"]').content = next === 'ru'
      ? 'Понятные способы изучать таблицу умножения: равные группы, опорные факты, удвоение и повторение.'
      : 'Learn times tables with equal groups, anchor facts, doubling, worked examples, and spaced review.';
    try { if (!embedded) localStorage.setItem(preference, next); }
    catch (_) { /* The language still changes for this visit. */ }
  }

  document.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  });
  setLanguage(language);
})();
