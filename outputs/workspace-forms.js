(function (global) {
  'use strict';

  global.MathRushForms = function (app) {
    const { state: s, tr } = app;

    async function submitForm(form) {
      const values = Object.fromEntries(new FormData(form));
      const operationUser = s.user?.id;
      const buttons = [...form.querySelectorAll('button[type="submit"]')];
      const note = form.querySelector('.work-form-note');
      if (note) note.textContent = '';
      buttons.forEach(button => { button.disabled = true; });
      try {
        switch (form.dataset.form) {
          case 'auth': {
            const mode = s.authMode;
            const input = { username: values.username, password: values.password };
            if (mode === 'register') input.displayName = values.displayName;
            if (mode === 'recover') input.recoveryCode = values.recoveryCode;
            const result = await app.request(`/api/auth/${mode}`, 'POST', input);
            form.reset();
            app.setUser(result.user);
            if (result.recoveryCode) app.showRecovery(result.recoveryCode);
            await global.MathRushCloud?.connect(result.user);
            await app.refresh();
            location.hash = 'today';
            app.render();
            break;
          }
          case 'profile': {
            const input = {
              displayName: values.displayName, goal: values.goal, bio: values.bio,
              languages: values.languages.split(',').map(value => value.trim()).filter(Boolean),
              publicProfile: Boolean(form.elements.publicProfile?.checked)
            };
            if (input.languages.length > 5) throw new Error(tr('Выбери не больше пяти языков.', 'Choose up to five languages.'));
            const result = await app.request('/api/profile', 'PATCH', input);
            if (s.user?.id !== operationUser) return;
            app.setUser(result.user);
            app.render();
            app.toast(tr('Профиль сохранён.', 'Profile saved.'));
            break;
          }
          case 'activate': {
            const result = await app.request('/api/tutor/activate', 'POST', { inviteCode: values.inviteCode });
            if (s.user?.id !== operationUser) return;
            form.reset();
            app.setUser(result.user);
            await app.refresh();
            location.hash = 'assignments';
            app.render();
            app.toast(tr('Кабинет преподавателя активирован.', 'Tutor workspace activated.'));
            break;
          }
          case 'join': {
            await app.request('/api/classroom/join', 'POST', { code: values.code });
            await app.refresh();
            app.render();
            app.toast(tr('Профиль связан с классом.', 'Your account is linked to the classroom.'));
            break;
          }
          case 'assignment': {
            await app.request('/api/assignments', 'POST', {
              studentId: values.studentId, title: values.title, topic: values.topic,
              targetCount: Number(values.targetCount), dueDate: values.dueDate || null
            });
            await app.refresh();
            app.render();
            app.toast(tr('Задание появилось у ученика.', 'The assignment is now available to the learner.'));
            break;
          }
          case 'review': {
            await app.request('/api/reviews', 'POST', { topic: values.topic, question: values.question, work: values.work });
            await app.refresh();
            app.render();
            app.toast(tr('Вопрос отправлен преподавателю.', 'Your question has been sent to your tutor.'));
            break;
          }
          case 'feedback': {
            await app.request(`/api/reviews/${encodeURIComponent(form.dataset.id)}`, 'PATCH', { feedback: values.feedback });
            await app.refresh();
            app.render();
            app.toast(tr('Разбор сохранён. Ученик увидит его в кабинете.', 'Feedback saved. The learner can read it in their workspace.'));
            break;
          }
          case 'answer': {
            const problemId = s.problem?.id;
            if (!problemId || s.answer) return;
            const userId = s.user.id;
            const result = await app.request('/api/practice/answer', 'POST', {
              problemId, answer: values.answer, ...(s.assignmentId ? { assignmentId: s.assignmentId } : {})
            });
            if (s.user?.id !== userId || s.problem?.id !== problemId) return;
            s.answer = result;
            s.answerDraft = values.answer;
            if (!result.duplicate && global.MathRushProgress) {
              const modes = { fractions: 'fractions-calculate', equations: 'equations-two-step', percentages: 'skills-percent' };
              global.MathRushProgress.recordAttempt(modes[s.problem.topic], result.correct, Date.now() - s.problemStartedAt, 'advanced');
            }
            await app.refresh();
            app.render();
            break;
          }
        }
      } catch (error) {
        if (note?.isConnected) note.textContent = app.errorText(error);
        else app.toast(app.errorText(error));
      } finally {
        buttons.forEach(button => { button.disabled = false; });
      }
    }

    async function action(button) {
      const name = button.dataset.action;
      if (name === 'auth-mode') {
        s.authMode = button.dataset.mode;
        app.render();
        return;
      }
      if (name === 'new-problem') { await app.newProblem(); return; }
      if (name === 'start-assignment') {
        const assignment = s.assignments.find(item => item.id === button.dataset.id);
        if (!assignment) return;
        s.assignmentId = assignment.id;
        s.topic = assignment.topic;
        app.saveAssignment();
        location.hash = 'practice';
        await app.newProblem();
        return;
      }
      if (name === 'leave-assignment') {
        s.assignmentId = null;
        app.saveAssignment();
        await app.newProblem();
        return;
      }
      button.disabled = true;
      try {
        if (name === 'logout') {
          const userId = s.user?.id;
          await app.request('/api/auth/logout', 'POST', {});
          if (s.user?.id !== userId) return;
          app.setUser(null);
          global.MathRushCloud?.disconnect();
          location.hash = 'auth';
          app.render();
        } else if (name === 'hint') {
          const problemId = s.problem?.id;
          if (!problemId) return;
          const result = await app.request('/api/practice/hint', 'POST', { problemId });
          if (s.problem?.id !== problemId) return;
          s.hint = result;
          app.render();
        } else if (name === 'export-progress') {
          const snapshot = global.MathRushCloud?.exportLocal();
          if (!snapshot) throw new Error(tr('Копия прогресса пока недоступна.', 'The progress copy is not available yet.'));
          const file = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(file);
          const link = document.createElement('a');
          link.href = url;
          link.download = `math-rush-progress-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          app.toast(tr('Копия включает сохранённые резервные версии этого аккаунта.', 'The export includes saved backups for this account.'));
        } else if (name === 'use-cloud-copy') {
          const result = await global.MathRushCloud?.useCloudCopy();
          app.render();
          const success = result?.state === 'synced' && !result.conflict;
          const storageError = result?.message?.includes('Could not keep a device backup');
          app.toast(success
            ? tr('Облачная копия загружена. Резервную копию устройства можно скачать в профиле.', 'Cloud copy loaded. Download the device backup from Profile anytime.')
            : storageError
              ? tr('Не удалось сохранить резервную копию. Скачай копию устройства и освободи место перед повторной попыткой.', 'Could not keep a device backup. Export the device copy and free storage before trying again.')
              : tr('Копия устройства сохранена. Облачную версию пока не удалось загрузить; попробуй снова.', 'The device copy was kept. Cloud recovery did not complete; try again when ready.'));
        } else if (name === 'sync' || name === 'import-guest') {
          const result = name === 'sync' ? await global.MathRushCloud?.sync() : await global.MathRushCloud?.importGuest();
          const message = result?.message;
          const translated = message?.includes('empty account only') ? tr('Перенос доступен только в пустой аккаунт. Текущий прогресс сохранён.', 'Import is available for empty accounts only. Existing progress was kept.')
            : message?.includes('no guest practice') ? tr('Гостевой практики для переноса пока нет.', 'There is no guest practice to import.')
              : app.syncText();
          app.toast(translated);
          if (app.tab() === 'profile') app.render();
        }
      } catch (error) { app.toast(app.errorText(error)); }
      finally { button.disabled = false; }
    }

    document.addEventListener('submit', event => {
      const form = event.target.closest('form[data-form]');
      if (!form) return;
      event.preventDefault();
      void submitForm(form);
    });
    document.addEventListener('click', event => {
      const languageButton = event.target.closest('[data-language]');
      if (languageButton) {
        s.language = languageButton.dataset.language;
        try { localStorage.setItem('mathRushHomeLanguage', s.language); } catch (_) { /* Update this visit. */ }
        app.render();
        return;
      }
      const button = event.target.closest('button[data-action]');
      if (button && !button.disabled) void action(button);
    });
    document.addEventListener('change', event => {
      if (event.target.name !== 'practiceTopic') return;
      s.topic = event.target.value;
      s.assignmentId = null;
      app.saveAssignment();
      void app.newProblem();
    });
    document.addEventListener('input', event => {
      if (event.target.name === 'answer') s.answerDraft = event.target.value;
    });
  };
})(window);
