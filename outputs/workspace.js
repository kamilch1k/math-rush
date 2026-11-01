(function (global) {
  'use strict';

  let language = 'ru';
  try { language = localStorage.getItem('mathRushHomeLanguage') === 'en' ? 'en' : 'ru'; } catch (_) { /* Russian default. */ }
  const state = {
    language, user: null, capabilities: { database: false, ai: false, tutorInvites: false },
    dashboard: null, assignments: [], classroom: null, reviews: [], tutors: [], errors: {},
    topic: 'fractions', problem: null, hint: null, answer: null, answerDraft: '',
    assignmentId: null, authMode: 'login', problemLoading: false, practiceError: ''
  };
  let accountVersion = 0;
  let problemVersion = 0;
  let toastTimer;
  const app = { state, topics: ['fractions', 'equations', 'percentages'] };
  app.tr = (ru, en) => state.language === 'ru' ? ru : en;
  app.e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  app.topicName = topic => ({ fractions: app.tr('Дроби', 'Fractions'), equations: app.tr('Уравнения', 'Equations'), percentages: app.tr('Проценты', 'Percentages') }[topic] || topic);
  app.date = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(state.language === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' });
  };
  app.tab = () => {
    const requested = location.hash.slice(1);
    if (requested === 'auth' && state.user) return 'today';
    return ['today', 'practice', 'assignments', 'feedback', 'tutors', 'profile', 'auth'].includes(requested) ? requested : 'today';
  };

  app.errorText = error => {
    const messages = {
      HOST_UNAVAILABLE: ['На этом адресе облачный кабинет недоступен. Тренажёры по-прежнему работают.', 'Cloud accounts are unavailable on this host. The practice archive still works.'],
      DATABASE_NOT_CONFIGURED: ['Облачные профили пока недоступны на этом адресе.', 'Cloud accounts are not available on this host.'],
      INVALID_CREDENTIALS: ['Проверь имя пользователя, пароль или код восстановления.', 'Check your username, passphrase, or recovery code.'],
      SIGN_IN_REQUIRED: ['Войди в профиль, чтобы продолжить.', 'Sign in to continue.'],
      USERNAME_TAKEN: ['Это имя пользователя уже занято.', 'That username is already taken.'],
      INVALID_USERNAME: ['От 3 до 32 латинских букв, цифр, точек, дефисов или _. Начни с буквы.', 'Use 3–32 letters, numbers, dots, hyphens, or underscores, starting with a letter.'],
      INVALID_PASSWORD: ['Используй пароль длиной от 12 до 128 символов.', 'Use a passphrase of 12–128 characters.'],
      INVALID_INVITE: ['Проверь код приглашения преподавателя.', 'Check your tutor invitation code.'],
      CLASSROOM_NOT_FOUND: ['Класс с таким кодом не найден.', 'No classroom was found with that code.'],
      ALREADY_LINKED: ['Профиль уже связан с другим классом.', 'Your account is already linked to a different classroom.'],
      CLASSROOM_REQUIRED: ['Сначала присоединись к классу преподавателя по коду.', 'Join your tutor’s classroom with an invitation code first.'],
      INVALID_ANSWER: ['Введи число или дробь, например 3/4.', 'Enter a number or a fraction such as 3/4.'],
      RATE_LIMITED: ['Слишком много запросов. Подожди немного и попробуй снова.', 'Too many requests. Wait a little and try again.']
    };
    return messages[error.code] ? app.tr(...messages[error.code]) : error.message || app.tr('Не удалось выполнить запрос. Попробуй снова.', 'The request failed. Please try again.');
  };

  app.request = async (path, method = 'GET', body) => {
    const requestedUser = state.user?.id;
    let response, result;
    try {
      response = await fetch(path, { method, credentials: 'same-origin', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      result = await response.json();
    } catch (_) {
      throw Object.assign(new Error(app.tr('Соединение недоступно. Проверь интернет и попробуй снова.', 'Connection unavailable. Check your internet connection and try again.')), { code: 'HOST_UNAVAILABLE' });
    }
    if (!response.ok) {
      if (response.status === 401 && state.user && state.user.id === requestedUser && !path.startsWith('/api/auth/')) {
        app.setUser(null);
        global.MathRushCloud?.disconnect();
        location.hash = 'auth';
      }
      throw Object.assign(new Error(result.message || ''), { code: result.code, status: response.status });
    }
    return result;
  };

  app.toast = message => {
    const element = document.getElementById('workspaceToast');
    element.textContent = message;
    element.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { element.hidden = true; }, 6000);
  };

  app.setUser = user => {
    if (state.user?.id !== user?.id) {
      accountVersion += 1;
      problemVersion += 1;
      Object.assign(state, { dashboard: null, assignments: [], classroom: null, reviews: [], errors: {}, problem: null, hint: null, answer: null, answerDraft: '', assignmentId: null });
    }
    state.user = user;
  };

  function assignmentStorageKey() { return `mathRushAssignment:${state.user?.id || 'guest'}`; }
  app.saveAssignment = () => {
    try {
      if (state.assignmentId) sessionStorage.setItem(assignmentStorageKey(), state.assignmentId);
      else sessionStorage.removeItem(assignmentStorageKey());
    } catch (_) { /* Practice still works without session storage. */ }
  };

  app.refresh = async () => {
    if (!state.user) return;
    const version = accountVersion;
    const resources = ['dashboard', 'assignments', 'classroom', 'reviews', 'tutors'];
    const responses = await Promise.allSettled(resources.map(key => app.request(`/api/${key}`)));
    if (version !== accountVersion) return;
    resources.forEach((key, index) => {
      const item = responses[index];
      if (item.status === 'fulfilled') {
        state[key] = ['assignments', 'reviews', 'tutors'].includes(key) ? item.value[key] : item.value;
        delete state.errors[key];
      } else state.errors[key] = app.errorText(item.reason);
    });
    if (!state.assignmentId && state.user.role === 'student') {
      try {
        const saved = sessionStorage.getItem(assignmentStorageKey());
        const assignment = state.assignments.find(item => item.id === saved && item.completedCount < item.targetCount);
        if (assignment) { state.assignmentId = assignment.id; state.topic = assignment.topic; }
      } catch (_) { /* A fresh practice session is fine. */ }
    }
  };

  app.newProblem = async () => {
    if (!state.user) { location.hash = 'auth'; return; }
    const assignment = state.assignments.find(item => item.id === state.assignmentId);
    if (assignment && assignment.completedCount >= assignment.targetCount) {
      state.assignmentId = null;
      app.saveAssignment();
    }
    const version = ++problemVersion;
    const userId = state.user.id;
    Object.assign(state, { problemLoading: true, problem: null, hint: null, answer: null, answerDraft: '', practiceError: '' });
    app.render();
    try {
      const result = await app.request(`/api/practice/problem?topic=${encodeURIComponent(state.topic)}&language=${state.language}`);
      if (version !== problemVersion || state.user?.id !== userId) return;
      state.problem = result.problem;
      state.problemStartedAt = Date.now();
    } catch (error) {
      if (version !== problemVersion) return;
      state.practiceError = app.errorText(error);
    } finally {
      if (version === problemVersion) { state.problemLoading = false; app.render(); }
    }
  };

  app.syncText = () => {
    const cloud = global.MathRushCloud?.status() || { state: 'guest' };
    const labels = {
      guest: ['Гостевая практика', 'Guest practice'], connecting: ['Подключаем профиль…', 'Connecting account…'],
      pending: ['Изменения сохранены на устройстве', 'Changes saved on this device'], syncing: ['Синхронизация…', 'Syncing…'],
      synced: ['Прогресс синхронизирован', 'Progress synced'], offline: ['Нет связи · сохранено на устройстве', 'Offline · saved on this device'],
      conflict: ['Есть другая версия прогресса · обе сохранены', 'Another progress version exists · both copies kept']
    };
    return app.tr(...(labels[cloud.state] || labels.guest));
  };

  function syncBadge() {
    document.getElementById('syncStatus').textContent = app.syncText();
    document.getElementById('syncButton').hidden = !state.user;
    const description = document.getElementById('profileSyncDescription');
    if (description) description.textContent = app.syncText();
    const banner = document.getElementById('cloudConflictBanner');
    const cloud = global.MathRushCloud?.status();
    if (banner) {
      banner.hidden = !cloud?.conflict;
      if (cloud?.conflict) {
        banner.innerHTML = `<div class="work-message"><strong>${app.tr('Две версии прогресса', 'Two progress versions')}</strong><p>${app.tr('На устройстве и в облаке разные результаты. Можно скачать копию с устройства или продолжить с облачной версией. Перед переключением копия устройства останется в резерве и будет доступна для скачивания в профиле.', 'Device and cloud progress differ. Download the device copy or continue with the cloud version. Before switching, your device copy is kept as a backup that you can download from Profile.')}</p><div class="home-hero-actions"><button type="button" class="platform-button small outline" data-action="export-progress">${app.tr('Скачать копию устройства', 'Export device copy')}</button><button type="button" class="platform-button small" data-action="use-cloud-copy" ${cloud.recovering ? 'disabled' : ''}>${app.tr('Использовать облачную копию', 'Use cloud copy')}</button></div></div>`;
      }
    }
  }

  const views = global.MathRushViews(app);
  app.render = () => {
    const tab = app.tab();
    document.documentElement.lang = state.language;
    document.title = app.tr('Личный кабинет — Math Rush', 'Workspace — Math Rush');
    const nav = [['today', '◷', 'Сегодня', 'Today'], ['practice', 'x²', 'Практика', 'Practice'], ['assignments', '⌁', 'Задания', 'Assignments'], ['feedback', '✳', 'Разбор решений', 'Human feedback'], ['tutors', '∴', 'Преподаватели', 'Tutors'], ['profile', '○', 'Мой профиль', 'Profile']];
    document.getElementById('workspaceNav').innerHTML = nav.map(([id, icon, ru, en]) => `<a href="#${id}" class="work-nav-link" ${tab === id ? 'aria-current="page"' : ''}><span class="work-nav-icon" aria-hidden="true">${icon}</span>${app.tr(ru, en)}</a>`).join('');
    document.getElementById('workspaceLabel').textContent = app.tr(state.user?.role === 'tutor' ? 'КАБИНЕТ ПРЕПОДАВАТЕЛЯ' : 'МОЙ КАБИНЕТ', state.user?.role === 'tutor' ? 'TUTOR WORKSPACE' : 'MY WORKSPACE');
    document.getElementById('accountBadge').textContent = state.user ? state.user.displayName.charAt(0).toUpperCase() : '∴';
    document.getElementById('sidebarAccount').innerHTML = state.user ? `<strong>${app.e(state.user.displayName)}</strong><span>@${app.e(state.user.username)}</span>` : `<a href="#auth">${app.tr('Войти в профиль', 'Sign in')}</a>`;
    document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === state.language)));
    const labels = { quizzes: ['Все тренажёры', 'Practice archive'], map: ['Карта знаний', 'Learning map'], runner: ['Математический забег', 'Math runner'] };
    document.querySelectorAll('[data-label]').forEach(element => { element.textContent = app.tr(...labels[element.dataset.label]); });
    const name = tab === 'tutors' && !state.capabilities.database ? 'guest' : tab === 'auth' || tab === 'tutors' ? tab : state.user ? tab : 'guest';
    document.getElementById('mainContent').innerHTML = '<div id="cloudConflictBanner" aria-live="polite" hidden></div>' + views[name]();
    syncBadge();
  };

  app.showRecovery = code => {
    const dialog = document.getElementById('recoveryDialog');
    document.getElementById('recoveryEyebrow').textContent = app.tr('Доступ к профилю', 'Account access');
    document.getElementById('recoveryTitle').textContent = app.tr('Сохрани код восстановления', 'Save your recovery code');
    document.getElementById('recoveryDescription').textContent = app.tr('Этот код показывается один раз. Сохрани его в надёжном месте: он понадобится, если забудешь пароль.', 'This code is shown once. Keep it somewhere safe; you will need it if you forget your passphrase.');
    document.getElementById('recoveryPrivate').textContent = app.tr('Не отправляй этот код преподавателю или другим людям.', 'Do not share this code with your tutor or anyone else.');
    document.getElementById('recoverySaved').textContent = app.tr('Я сохранил код', 'I have saved my code');
    document.getElementById('recoveryCode').textContent = code;
    dialog.showModal();
  };

  global.MathRushWorkspace = app;
  global.MathRushForms(app);
  document.getElementById('recoveryDialog').addEventListener('cancel', event => event.preventDefault());
  document.getElementById('recoverySaved').addEventListener('click', () => {
    document.getElementById('recoveryCode').textContent = '';
    document.getElementById('recoveryDialog').close();
  });
  global.addEventListener('mathrush:cloud', syncBadge);
  global.addEventListener('hashchange', () => { app.render(); window.scrollTo({ top: 0, behavior: 'instant' }); });

  (async () => {
    try { state.capabilities = await app.request('/api/capabilities'); }
    catch (_) { /* Static hosting supports the practice archive. */ }
    if (state.capabilities.database) {
      try {
        const current = await app.request('/api/me');
        app.setUser(current.user);
        if (state.user) {
          if (location.hash === '#auth') history.replaceState(null, '', '#today');
          await global.MathRushCloud?.ready;
          await global.MathRushCloud?.connect(state.user);
          await app.refresh();
        } else {
          try { state.tutors = (await app.request('/api/tutors')).tutors; } catch (_) { /* Empty directory state. */ }
        }
      } catch (_) { /* Sign in remains available if the initial session check fails. */ }
    }
    app.render();
  })();
})(window);
