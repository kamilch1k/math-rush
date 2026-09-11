(function (global) {
  'use strict';

  const STORAGE_KEY = 'mathRushLearningV2';
  const LEGACY_KEY = 'mathRushProfileV1';
  const MAX_ATTEMPTS = 500;

  const skills = [
    { id: 'addition', title: 'Сложение', category: 'arithmetic', prerequisites: [], mode: 'addition-ten' },
    { id: 'subtraction', title: 'Вычитание', category: 'arithmetic', prerequisites: ['addition'], mode: 'subtraction-ten' },
    { id: 'multiplication', title: 'Умножение', category: 'arithmetic', prerequisites: ['addition'], mode: 'tables' },
    { id: 'division', title: 'Деление', category: 'arithmetic', prerequisites: ['multiplication'], mode: 'division' },
    { id: 'chain-addition', title: 'Действия по шагам', category: 'arithmetic', prerequisites: ['addition', 'subtraction'], mode: 'arithmetic-chain-addition' },
    { id: 'column-addition', title: 'Сложение в столбик', category: 'arithmetic', prerequisites: ['addition', 'subtraction'], mode: 'column-addition' },
    { id: 'column-subtraction', title: 'Вычитание в столбик', category: 'arithmetic', prerequisites: ['subtraction', 'column-addition'], mode: 'column-subtraction' },
    { id: 'column-multiplication', title: 'Умножение в столбик', category: 'arithmetic', prerequisites: ['multiplication', 'column-addition'], mode: 'column-multiplication' },
    { id: 'order-of-operations', title: 'Порядок действий', category: 'arithmetic', prerequisites: ['multiplication', 'division'], mode: 'arithmetic-order' },
    { id: 'parentheses', title: 'Скобки', category: 'arithmetic', prerequisites: ['order-of-operations'], mode: 'arithmetic-parentheses' },
    { id: 'fractions', title: 'Дроби', category: 'arithmetic', prerequisites: ['division', 'parentheses'], mode: 'fractions-simplify' },
    { id: 'percentages', title: 'Проценты', category: 'arithmetic', prerequisites: ['fractions'], mode: 'skills-percent' },
    { id: 'expressions', title: 'Простые выражения', category: 'algebra', prerequisites: ['addition', 'subtraction', 'order-of-operations', 'parentheses'], mode: 'equations-missing' },
    { id: 'powers', title: 'Степени', category: 'algebra', prerequisites: ['multiplication', 'order-of-operations', 'parentheses'], mode: 'algebra-powers' },
    { id: 'equation-add', title: 'x + a = b', category: 'algebra', prerequisites: ['expressions', 'order-of-operations', 'parentheses'], mode: 'equations-addition' },
    { id: 'roots', title: 'Квадратные корни', category: 'algebra', prerequisites: ['powers', 'division', 'order-of-operations', 'parentheses'], mode: 'algebra-roots' },
    { id: 'equation-multiply', title: 'ax = b', category: 'algebra', prerequisites: ['multiplication', 'equation-add', 'order-of-operations', 'parentheses'], mode: 'equations-multiplication' },
    { id: 'equation-divide', title: 'x / a = b', category: 'algebra', prerequisites: ['division', 'equation-add', 'order-of-operations', 'parentheses'], mode: 'equations-division' },
    { id: 'equation-two-step', title: 'ax + b = c', category: 'algebra', prerequisites: ['equation-add', 'equation-multiply', 'order-of-operations', 'parentheses'], mode: 'equations-two-step' },
    { id: 'linear-equations', title: 'Линейные уравнения', category: 'algebra', prerequisites: ['equation-two-step', 'equation-divide', 'order-of-operations', 'parentheses'], mode: 'equations' },
    { id: 'sequences', title: 'Прогрессии', category: 'algebra', prerequisites: ['multiplication', 'equation-two-step', 'order-of-operations', 'parentheses'], mode: 'algebra-sequences' },
    { id: 'systems', title: 'Системы уравнений', category: 'algebra', prerequisites: ['linear-equations', 'equation-two-step', 'order-of-operations', 'parentheses'], mode: 'algebra-systems' },
    { id: 'inequalities', title: 'Неравенства', category: 'algebra', prerequisites: ['linear-equations', 'order-of-operations', 'parentheses'], mode: 'algebra-inequalities' },
    { id: 'functions', title: 'Функции', category: 'algebra', prerequisites: ['linear-equations', 'order-of-operations', 'parentheses'], mode: 'algebra-functions' },
    { id: 'polynomials', title: 'Многочлены', category: 'algebra', prerequisites: ['powers', 'functions', 'order-of-operations', 'parentheses'], mode: 'algebra-polynomials' },
    { id: 'linear-functions', title: 'Линейные функции', category: 'algebra', prerequisites: ['functions', 'equation-two-step', 'order-of-operations', 'parentheses'], mode: 'algebra-linear-functions' },
    { id: 'quadratics', title: 'Квадратные уравнения', category: 'algebra', prerequisites: ['polynomials', 'equation-two-step', 'order-of-operations', 'parentheses'], mode: 'algebra-quadratics' },
    { id: 'derivatives', title: 'Производные', category: 'algebra', prerequisites: ['functions', 'linear-functions', 'polynomials', 'order-of-operations', 'parentheses'], href: 'derivatives.html' },
    { id: 'shapes', title: 'Фигуры', category: 'geometry', prerequisites: [], mode: 'geometry-shapes' },
    { id: 'perimeter', title: 'Периметр', category: 'geometry', prerequisites: ['shapes', 'addition'], mode: 'geometry-perimeter' },
    { id: 'angles', title: 'Углы', category: 'geometry', prerequisites: ['shapes', 'subtraction'], mode: 'geometry-angles' },
    { id: 'area', title: 'Площадь', category: 'geometry', prerequisites: ['shapes', 'multiplication', 'perimeter'], mode: 'geometry-area' },
    { id: 'triangles', title: 'Треугольники', category: 'geometry', prerequisites: ['shapes', 'angles'], mode: 'geometry-triangles' },
    { id: 'coordinates', title: 'Координаты', category: 'geometry', prerequisites: ['shapes', 'subtraction'], mode: 'geometry-coordinates' }
  ];

  const modeToSkill = {
    'addition-ten': 'addition', 'addition-twenty': 'addition', addition: 'addition',
    'subtraction-ten': 'subtraction', subtraction: 'subtraction', 'addition-subtraction': 'subtraction',
    tables: 'multiplication', multiplication: 'multiplication', division: 'division',
    'column-addition': 'column-addition', 'column-subtraction': 'column-subtraction', 'column-multiplication': 'column-multiplication',
    'arithmetic-chain-addition': 'chain-addition', 'arithmetic-parentheses': 'parentheses', 'arithmetic-order': 'order-of-operations',
    'fractions-simplify': 'fractions', 'fractions-compare': 'fractions', 'fractions-calculate': 'fractions', 'fractions-mixed': 'fractions',
    'equations-missing': 'expressions', 'equations-addition': 'equation-add', 'equations-subtraction': 'equation-add',
    'equations-multiplication': 'equation-multiply', 'equations-division': 'equation-divide',
    'equations-two-step': 'equation-two-step', equations: 'linear-equations', 'skills-story-equation': 'equation-add',
    'algebra-inequalities': 'inequalities', 'algebra-functions': 'functions', 'algebra-linear-functions': 'linear-functions',
    'algebra-powers': 'powers', 'algebra-roots': 'roots', 'algebra-polynomials': 'polynomials',
    'algebra-quadratics': 'quadratics', 'algebra-systems': 'systems', 'algebra-sequences': 'sequences',
    'geometry-shapes': 'shapes', 'geometry-angles': 'angles', 'geometry-triangles': 'triangles', 'geometry-perimeter': 'perimeter', 'geometry-side': 'perimeter', 'geometry-area': 'area', 'geometry-coordinates': 'coordinates',
    'skills-percent': 'percentages',
    'derivatives-whiteboard': 'derivatives'
  };

  function emptyData() {
    return { version: 2, totalXp: 0, attempts: [], skills: {}, streakDays: 0, lastActiveDate: null };
  }

  function load() {
    let data = emptyData();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (parsed && parsed.version === 2) data = Object.assign(data, parsed);
    } catch (_) { /* Local storage can be unavailable. */ }
    if (!data.totalXp) {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
        if (legacy && Number.isFinite(Number(legacy.totalScore))) data.totalXp = Math.max(0, Math.floor(Number(legacy.totalScore)) * 10);
      } catch (_) { /* Ignore malformed legacy data. */ }
    }
    return data;
  }

  function save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) { /* Keep the session usable without persistence. */ }
    return data;
  }

  function masteryFor(skillId, data = load()) {
    const attempts = data.attempts.filter((attempt) => attempt.skillId === skillId);
    if (!attempts.length) return 0;
    const recent = attempts.slice(-20);
    let weight = 0;
    let earned = 0;
    recent.forEach((attempt, index) => {
      const recency = 1 + index / Math.max(1, recent.length - 1);
      const difficulty = { simple: 0.9, advanced: 1, expert: 1.1 }[attempt.difficulty] || 1;
      weight += recency;
      if (attempt.isCorrect) earned += recency * difficulty;
    });
    const confidence = 0.35 + 0.65 * Math.min(1, attempts.length / 20);
    return Math.min(100, Math.round((earned / weight) * confidence * 100));
  }

  function readinessFor(skill, data = load()) {
    if (!skill.prerequisites.length) return 100;
    return Math.round(skill.prerequisites.reduce((sum, id) => sum + masteryFor(id, data), 0) / skill.prerequisites.length);
  }

  function stateFor(skill, data = load()) {
    const mastery = masteryFor(skill.id, data);
    const attempts = data.attempts.filter((attempt) => attempt.skillId === skill.id).length;
    if (mastery >= 80) return 'mastered';
    if (attempts) return 'learning';
    if (readinessFor(skill, data) < 35) return 'locked';
    return 'available';
  }

  function updateDailyStreak(data, date = new Date()) {
    const today = date.toISOString().slice(0, 10);
    if (data.lastActiveDate === today) return;
    const yesterday = new Date(date);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    data.streakDays = data.lastActiveDate === yesterday.toISOString().slice(0, 10) ? (data.streakDays || 0) + 1 : 1;
    data.lastActiveDate = today;
  }

  function recordAttempt(mode, isCorrect, durationMs, difficulty = 'simple') {
    const skillId = modeToSkill[mode] || mode;
    if (!skills.some((skill) => skill.id === skillId)) return load();
    const data = load();
    const xp = isCorrect ? 10 + ({ simple: 0, advanced: 3, expert: 6 }[difficulty] || 0) : 0;
    data.attempts.push({ skillId, problemType: mode, isCorrect: Boolean(isCorrect), duration: Math.max(0, Math.round(Number(durationMs) || 0)), difficulty, xp, createdAt: new Date().toISOString() });
    if (data.attempts.length > MAX_ATTEMPTS) data.attempts = data.attempts.slice(-MAX_ATTEMPTS);
    data.totalXp += xp;
    const summary = data.skills[skillId] || { xp: 0, attempts: 0, correctAttempts: 0, lastPracticedAt: null };
    summary.xp += xp;
    summary.attempts += 1;
    if (isCorrect) summary.correctAttempts += 1;
    summary.lastPracticedAt = new Date().toISOString();
    data.skills[skillId] = summary;
    updateDailyStreak(data);
    return save(data);
  }

  function skillById(id) { return skills.find((skill) => skill.id === id) || null; }
  function modeForSkill(id) { return skillById(id)?.mode || null; }
  function hrefForSkill(skill) { return skill.href || `math-rush.html?skill=${encodeURIComponent(skill.id)}`; }
  function levelForXp(xp) { return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 50)) + 1; }

  function categorySummary(category, data = load()) {
    const categorySkills = skills.filter((skill) => skill.category === category);
    const mastery = categorySkills.length ? Math.round(categorySkills.reduce((sum, skill) => sum + masteryFor(skill.id, data), 0) / categorySkills.length) : 0;
    return { mastery, skills: categorySkills.length };
  }

  global.MathRushProgress = { STORAGE_KEY, skills, modeToSkill, load, save, recordAttempt, masteryFor, readinessFor, stateFor, skillById, modeForSkill, hrefForSkill, levelForXp, categorySummary };
})(window);
