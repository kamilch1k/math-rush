(function (global) {
  'use strict';
  const core = global.MathRushMultiplication, $ = id => document.getElementById(id);
  const embedded = global.MathRushEmbed?.embedded;
  let language = embedded ? global.MathRushEmbed.language : 'ru';
  try { if (!embedded) language = localStorage.getItem('mathRushHomeLanguage') === 'en' ? 'en' : 'ru'; } catch (_) {}
  const state = { mode: 'explore', question: null, results: [], recent: [], hinted: false, answered: false, started: 0 };
  const tr = (ru, en) => language === 'ru' ? ru : en;
  const e = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const summaries = () => core.history(global.MathRushProgress.load().attempts);

  ['exploreA', 'exploreB', 'tableSelect'].forEach(id => {
    for (let n = 1; n <= 12; n++) {
      const option = document.createElement('option');
      option.value = n; option.textContent = n; $(id).append(option);
    }
  });
  $('exploreA').value = '7'; $('exploreB').value = '8';

  function translate() {
    const draft = $('factAnswer')?.value;
    document.documentElement.lang = language;
    document.title = tr('Таблица умножения — Math Rush', 'Times tables — Math Rush');
    document.querySelectorAll('[data-ru][data-en]').forEach(node => { node.textContent = node.dataset[language]; });
    document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
    try { if (!embedded) localStorage.setItem('mathRushHomeLanguage', language); } catch (_) {}
    explore(); renderMap();
    if (state.mode !== 'explore') {
      renderQuestion();
      if (draft && $('factAnswer') && !state.answered) $('factAnswer').value = draft;
    }
    global.dispatchEvent(new CustomEvent('mathrush:language'));
  }

  function explore() {
    const a = Number($('exploreA').value), b = Number($('exploreB').value);
    $('exploreEquation').textContent = `${a} × ${b} = ${a * b}`;
    $('exploreStrategy').textContent = core.strategy(a, b, language);
    $('exploreCommutative').textContent = tr(
      `${a} групп по ${b} и ${b} групп по ${a} содержат одинаковое количество: ${a * b}.`,
      `${a} groups of ${b} and ${b} groups of ${a} contain the same total: ${a * b}.`);
    const array = $('arrayPicture');
    array.style.setProperty('--columns', b);
    array.setAttribute('aria-label', tr(`${a} рядов по ${b} точек, всего ${a * b}`, `${a} rows of ${b} dots, ${a * b} in total`));
    array.replaceChildren();
    for (let i = 0; i < a * b; i++) {
      const dot = document.createElement('i');
      dot.setAttribute('aria-hidden', 'true');
      if (Math.floor(i / b) >= 5) dot.className = 'alternate';
      array.append(dot);
    }
  }

  function renderMap() {
    const known = summaries(), map = $('factMap');
    map.innerHTML = '<span aria-hidden="true">×</span>' + Array.from({ length: 12 }, (_, i) => `<span aria-hidden="true">${i + 1}</span>`).join('');
    for (let a = 1; a <= 12; a++) {
      const label = document.createElement('span');
      label.textContent = a; label.setAttribute('aria-hidden', 'true'); map.append(label);
      for (let b = 1; b <= 12; b++) {
        const item = known.get(core.key(a, b));
        const status = item ? item.needsHelp ? 'needs-review' : 'independent' : '';
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = a * b; button.className = status;
        const description = item ? item.needsHelp ? tr('повторить', 'revisit') : tr('последний ответ самостоятельно', 'last recalled independently') : tr('ещё не пробовал', 'not tried yet');
        button.setAttribute('aria-label', `${a} × ${b}: ${description}`);
        button.addEventListener('click', () => {
          $('exploreA').value = a; $('exploreB').value = b; setMode('explore');
          $('explore').scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        map.append(button);
      }
    }
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.mode === mode));
      button.tabIndex = button.dataset.mode === mode ? 0 : -1;
    });
    $('explore').hidden = mode !== 'explore';
    $('practice').hidden = mode === 'explore';
    $('practice').setAttribute('aria-labelledby', mode === 'review' ? 'tab-review' : 'tab-practice');
    if (mode === 'explore') explore(); else startRound();
  }

  function startRound() {
    state.results = []; state.recent = [];
    nextQuestion();
  }

  function nextQuestion() {
    if (state.results.length >= 10) { state.question = null; renderQuestion(); return; }
    const fact = core.choose(core.facts($('tableSelect').value), summaries(), state.recent, state.mode === 'review');
    state.question = core.question(fact, $('formatSelect').value);
    state.hinted = false; state.answered = false; state.started = performance.now();
    state.recent.push(fact.key);
    renderQuestion();
    $('factAnswer')?.focus({ preventScroll: true });
  }

  function renderQuestion() {
    const review = state.mode === 'review';
    $('practiceTitle').textContent = review ? tr('Вернись к сложным примерам', 'Revisit the tricky facts') : tr('Короткий раунд: 10 заданий', 'A short round: 10 questions');
    $('reviewNote').textContent = review
      ? tr('Чаще возвращаем ошибки и ответы с подсказкой. Когда повторять ещё рано, добавляем новые примеры.', 'Mistakes and hinted answers return more often. When learned facts are not due yet, we include new ones.')
      : tr('Без таймера. Подсказка помогает разобраться; XP даём за самостоятельный правильный ответ.', 'No timer. Hints help you understand; XP rewards independent correct recall.');
    const q = state.question;
    if (!q) { renderSummary(); return; }
    const correct = state.results.filter(result => result.independent).length;
    const last = state.answered ? state.results.at(-1) : null;
    const hint = core.strategy(q.fact.a, q.fact.b, language) + (q.format === 'multiply' ? '' : tr(' Вспомни, как связаны умножение и деление.', ' Recall how multiplication and division are connected.'));
    $('roundArea').innerHTML = `
      <div class="facts-round-meta"><span>${tr('Задание', 'Question')} ${state.results.length + (state.answered ? 0 : 1)} / 10</span><span>${tr('Самостоятельно', 'Independent')}: ${correct}</span></div>
      <div class="progress-track"><span style="width:${state.results.length * 10}%"></span></div>
      <div class="facts-question"><p class="facts-equation" id="factPrompt">${q.prompt}</p>
        <form class="facts-answer-form" id="factForm">
          <input id="factAnswer" inputmode="numeric" autocomplete="off" maxlength="3" aria-label="${tr('Ответ', 'Answer')}" aria-describedby="factPrompt factFeedback" ${state.answered ? 'disabled' : ''}>
          <button class="button" type="submit" ${state.answered ? 'disabled' : ''}>${tr('Проверить', 'Check')}</button>
        </form>
        <p id="factFeedback" class="facts-feedback ${last ? last.correct ? 'correct' : 'revisit' : ''}" role="status">${last ? feedback(last, q) : ''}</p>
        <div class="facts-actions" style="justify-content:center">
          <button class="button secondary" type="button" id="factHint" ${state.hinted || state.answered ? 'disabled' : ''}>${tr('Показать способ', 'Show a strategy')}</button>
          <button class="button" type="button" id="factNext" ${state.answered ? '' : 'hidden'}>${state.results.length === 10 ? tr('Итоги', 'Round summary') : tr('Следующий пример', 'Next question')} →</button>
        </div>
        <div id="factHintText" class="facts-hint" ${state.hinted || state.answered ? '' : 'hidden'}>${e(hint)}</div>
      </div>`;
    $('factForm').addEventListener('submit', submitAnswer);
    $('factHint').addEventListener('click', () => {
      if (state.answered || state.hinted) return;
      state.hinted = true;
      $('factHintText').hidden = false; $('factHint').disabled = true;
      $('factAnswer').focus({ preventScroll: true });
    });
    $('factNext').addEventListener('click', nextQuestion);
  }

  function feedback(result, q) {
    if (!result.correct) return tr(`Верный ответ: ${q.expected}. Разберём способ и вернёмся к этому примеру.`, `The answer is ${q.expected}. Explore the strategy; this fact will return.`);
    if (!result.independent) return tr('Верно с подсказкой. Позже попробуем вспомнить самостоятельно.', 'Correct with a hint. Try recalling it independently later.');
    return tr('Верно, самостоятельно! +10 XP', 'Correct, independently! +10 XP');
  }

  function submitAnswer(event) {
    event.preventDefault();
    if (state.answered || !state.question) return;
    const value = core.answer($('factAnswer').value);
    if (value === null) {
      $('factFeedback').textContent = tr('Введи целое число.', 'Enter a whole number.');
      $('factAnswer').focus(); return;
    }
    const q = state.question, correct = value === q.expected;
    state.answered = true;
    state.results.push({ fact: q.fact, correct, independent: correct && !state.hinted });
    const mode = `tables-${state.hinted ? 'guided-' : ''}${q.fact.a}x${q.fact.b}`;
    global.MathRushProgress.recordAttempt(mode, correct, Math.min(86400000, performance.now() - state.started), 'simple');
    renderQuestion();
    $('factNext').focus({ preventScroll: true });
  }

  function renderSummary() {
    const count = state.results.filter(result => result.independent).length;
    const revisit = new Map(state.results.filter(result => !result.independent).map(result => [result.fact.key, result.fact]));
    $('roundArea').innerHTML = `<div class="facts-summary"><h3>${tr('Раунд завершён', 'Round complete')}</h3><p>${tr(`Самостоятельно: ${count} из ${state.results.length}.`, `Independent recall: ${count} of ${state.results.length}.`)}</p>
      <p>${revisit.size ? tr('К этим примерам стоит вернуться:', 'Revisit these facts:') : tr('Хорошая работа. Сделай перерыв и попробуй снова в другой день.', 'Good work. Take a break and try recalling these on another day.')}</p>
      <ul>${[...revisit.values()].map(f => `<li>${f.a} × ${f.b} = ${f.a * f.b}</li>`).join('')}</ul>
      <div class="facts-actions"><button class="button" id="anotherRound">${tr('Ещё короткий раунд', 'Another short round')}</button><a href="learn.html#multiplication">${tr('Вернуться к объяснениям', 'Back to explanations')}</a></div></div>`;
    $('anotherRound').addEventListener('click', startRound);
  }

  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => { language = button.dataset.language; translate(); }));
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll('[data-mode]')], current = tabs.indexOf(button);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setMode(tabs[index].dataset.mode); tabs[index].focus();
    });
  });
  ['exploreA', 'exploreB'].forEach(id => $(id).addEventListener('change', explore));
  $('swapFactors').addEventListener('click', () => {
    const a = $('exploreA').value; $('exploreA').value = $('exploreB').value; $('exploreB').value = a; explore();
  });
  $('practiseThis').addEventListener('click', () => { $('tableSelect').value = $('exploreA').value; setMode('practice'); });
  ['tableSelect', 'formatSelect'].forEach(id => $(id).addEventListener('change', startRound));
  global.addEventListener('mathrush:progress', renderMap);
  Promise.resolve(global.MathRushCloud?.ready).finally(() => { translate(); setMode('explore'); });
})(window);
