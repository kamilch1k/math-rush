(function (global) {
  'use strict';

  function accountId() { return global.MathRushCloud?.status().userId || null; }
  function key(base) { const id = accountId(); return id ? `${base}:account:${encodeURIComponent(id)}` : base; }
  function score() {
    return accountId() ? Math.floor(Math.max(0, Number(global.MathRushProgress.load().totalXp) || 0) / 10) : null;
  }

  const api = { accountId, key, score, ready: false };
  global.MathRushLegacy = api;
  const document = global.document;
  if (!document) return;
  const main = document.querySelector('main');
  if (main) main.inert = true;

  function labels() {
    let language = document.documentElement.lang;
    if (!document.querySelector('[data-language]')) {
      try { language = JSON.parse(global.localStorage.getItem('mathRushPreferencesV1') || '{}').language || language; } catch (_) { /* Keep the page language. */ }
    }
    return language === 'ru' ? {
      workspace: 'Мой кабинет', materials: 'Как учиться', tables: 'Таблица умножения', source: 'Открытый код · MIT', home: 'Главная', loading: 'Загружаем прогресс…',
      guest: 'Гостевой режим · прогресс на этом устройстве', synced: 'Прогресс аккаунта синхронизирован',
      pending: 'Прогресс на устройстве · ожидает синхронизации', offline: 'Нет связи · прогресс аккаунта на устройстве',
      conflict: 'Другая версия прогресса · открой кабинет', account: 'Прогресс аккаунта'
    } : {
      workspace: 'My workspace', materials: 'Learning guides', tables: 'Times tables', source: 'Open source · MIT', home: 'Home', loading: 'Loading progress…',
      guest: 'Guest practice · saved on this device', synced: 'Account progress synced',
      pending: 'Saved on this device · sync pending', offline: 'Offline · account progress on this device',
      conflict: 'Progress conflict · open your workspace', account: 'Account progress'
    };
  }

  const notice = document.createElement('a');
  notice.href = 'workspace.html';
  notice.className = 'legacy-cloud-status';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.style.cssText = 'position:fixed;left:12px;bottom:10px;z-index:90;max-width:calc(100vw - 24px);padding:7px 11px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;color:#344054;font:12px/1.4 system-ui;text-decoration:none;box-shadow:0 2px 10px #10182812';
  notice.textContent = labels().loading;
  document.body.appendChild(notice);

  function renderStatus() {
    const status = global.MathRushCloud?.status() || { state: 'guest' };
    const words = labels();
    const state = status.state === 'syncing' || status.state === 'connecting' ? 'pending' : status.state;
    notice.textContent = words[state] || words.account;
    notice.title = status.message || notice.textContent;
    notice.dataset.state = status.state;
  }

  function addNavigation() {
    if (document.querySelector('[data-workspace-link]')) return;
    const originalNav = document.querySelector('.page-nav');
    let host = document.querySelector('.nav-links');
    if (originalNav || !host) {
      host = document.createElement('nav');
      host.setAttribute('aria-label', 'Math Rush learning');
      host.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;padding:10px 18px;border-bottom:1px solid #e4e7ec;background:#ffffffc9';
      if (originalNav) originalNav.after(host);
      else document.querySelector('main')?.prepend(host);
    }
    const words = labels();
    [['learn.html', 'materials'], ['multiplication.html', 'tables'], ['workspace.html', 'workspace'], ['https://github.com/kamilch1k/math-rush', 'source']].forEach(([href, label]) => {
      if ([...host.querySelectorAll('a')].some(link => link.getAttribute('href') === href)) return;
      const link = document.createElement('a');
      link.href = href; link.textContent = words[label];
      link.dataset.ru = { workspace: 'Мой кабинет', materials: 'Как учиться', tables: 'Таблица умножения', source: 'Открытый код · MIT' }[label];
      link.dataset.en = { workspace: 'My workspace', materials: 'Learning guides', tables: 'Times tables', source: 'Open source · MIT' }[label];
      if (label === 'workspace') link.dataset.workspaceLink = '';
      if (originalNav) link.style.cssText = 'display:inline-flex;align-items:center;padding:6px 10px;border:1px solid #e4e7ec;border-radius:10px;color:#4f46e5;background:#fff;text-decoration:none;font:700 12px/1.4 system-ui';
      host.appendChild(link);
    });
  }

  global.addEventListener('mathrush:cloud', renderStatus);
  global.addEventListener('mathrush:language', renderStatus);
  Promise.resolve(global.MathRushCloud?.ready).finally(() => {
    api.ready = true;
    addNavigation();
    renderStatus();
    if (main) main.inert = false;
  });
})(window);
