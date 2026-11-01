(function (global) {
  'use strict';

  const byId = id => document.getElementById(id);
  const progress = global.MathRushProgress;
  if (!progress) return;

  function count(value) { return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0; }

  function renderSkills(host, items, empty) {
    host.textContent = '';
    if (!items.length) {
      const item = document.createElement('li');
      item.className = 'muted';
      item.textContent = empty;
      host.appendChild(item);
      return;
    }
    for (const { skill, mastery } of items) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const value = document.createElement('strong');
      name.textContent = `${mastery >= 80 ? '✓' : '○'} ${skill.title}`;
      value.textContent = `${mastery}%`;
      item.append(name, value);
      host.appendChild(item);
    }
  }

  function render() {
    const data = progress.load();
    const totals = Object.values(data.skills).reduce((sum, skill) => ({
      attempts: sum.attempts + count(skill.attempts), correct: sum.correct + count(skill.correctAttempts)
    }), { attempts: 0, correct: 0 });
    byId('levelTitle').textContent = `Уровень ${progress.levelForXp(data.totalXp)}`;
    byId('xpText').textContent = `${data.totalXp} XP`;
    byId('streakText').textContent = `🔥 Серия: ${data.streakDays || 0} дней`;
    byId('attempts').textContent = totals.attempts;
    byId('correct').textContent = totals.correct;
    byId('accuracy').textContent = `${totals.attempts ? Math.round(totals.correct / totals.attempts * 100) : 0}%`;
    const ranked = progress.skills.map(skill => ({ skill, mastery: progress.masteryFor(skill.id, data) }));
    byId('mastered').textContent = ranked.filter(item => item.mastery >= 80).length;
    const categories = byId('categories');
    categories.textContent = '';
    for (const [id, title] of Object.entries({ arithmetic: 'Арифметика', algebra: 'Алгебра', geometry: 'Геометрия' })) {
      const mastery = progress.categorySummary(id, data).mastery;
      const row = document.createElement('div');
      row.className = 'category-row';
      const name = document.createElement('strong');
      const track = document.createElement('div');
      const bar = document.createElement('span');
      const value = document.createElement('strong');
      name.textContent = title;
      track.className = 'progress-track';
      bar.style.width = `${mastery}%`;
      value.textContent = `${mastery}%`;
      track.appendChild(bar);
      row.append(name, track, value);
      categories.appendChild(row);
    }
    const practiced = ranked.filter(item => count(data.skills[item.skill.id]?.attempts) > 0);
    renderSkills(byId('strongSkills'), [...practiced].sort((a, b) => b.mastery - a.mastery).slice(0, 4), 'Реши первые задачи — здесь появятся сильные темы.');
    renderSkills(byId('reviewSkills'), [...practiced].sort((a, b) => a.mastery - b.mastery).slice(0, 4), 'Пока нечего повторять.');
  }

  Promise.resolve(global.MathRushCloud?.ready).then(() => {
    render();
    global.addEventListener('mathrush:progress', render);
  });
})(window);
