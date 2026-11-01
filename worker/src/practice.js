import { HttpError, TOPICS, all, body, json, nowIso, rate, text, topic } from './http.js';

const random = (min, max) => min + crypto.getRandomValues(new Uint32Array(1))[0] % (max - min + 1);
const gcd = (a, b) => b ? gcd(b, a % b) : a;

function makeProblem(selected, language) {
  const ru = language === 'ru';
  if (selected === 'fractions') {
    const denominator = random(2, 12);
    const first = random(1, denominator - 1);
    const second = random(1, denominator - 1);
    const total = first + second;
    const factor = gcd(total, denominator);
    const expected = denominator / factor === 1 ? String(total / factor) : `${total / factor}/${denominator / factor}`;
    return {
      prompt: `${ru ? 'Вычисли: ' : ''}${first}/${denominator} + ${second}/${denominator} = ?`, expected,
      hint: ru
        ? `Знаменатели одинаковые. Сложи ${first} и ${second}, оставив ${denominator} в знаменателе. Затем сократи дробь, если возможно.`
        : `The denominators match. Add ${first} and ${second}, keeping ${denominator} as the denominator. Then simplify if possible.`,
      explanation: `${first}/${denominator} + ${second}/${denominator} = ${total}/${denominator} = ${expected}. ${ru ? 'Одинаковые знаменатели обозначают части одинакового размера.' : 'Equal denominators mean equal-sized parts.'}`,
      inputHint: ru ? 'Введи дробь, целое или десятичное число.' : 'Enter a fraction, whole number, or decimal.'
    };
  }
  if (selected === 'equations') {
    const a = random(2, 9), answer = random(1, 12), b = random(1, 20), c = a * answer + b;
    return {
      prompt: `${ru ? 'Реши уравнение' : 'Solve for x'}: ${a}x + ${b} = ${c}`, expected: String(answer),
      hint: ru
        ? `Сначала вычти ${b} из обеих частей уравнения. На что нужно разделить, чтобы остался только x?`
        : `Subtract ${b} from both sides first. What will you divide by to leave x on its own?`,
      explanation: ru
        ? `Вычитаем ${b}: ${a}x = ${c - b}. Делим обе части на ${a}: x = ${answer}.`
        : `Subtract ${b}: ${a}x = ${c - b}. Divide both sides by ${a}: x = ${answer}.`,
      inputHint: ru ? 'Введи значение x.' : 'Enter the value of x.'
    };
  }
  const percent = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75][random(0, 9)], whole = random(1, 15) * 20;
  return {
    prompt: ru ? `Найди ${percent}% от ${whole}.` : `What is ${percent}% of ${whole}?`, expected: String(percent * whole / 100),
    hint: ru
      ? `Процент — это сотая часть. Чтобы найти 1% от ${whole}, раздели число на 100. Затем умножь на ${percent}.`
      : `Percent means out of 100. Find 1% of ${whole} by dividing by 100, then multiply by ${percent}.`,
    explanation: `${percent}% ${ru ? 'от' : 'of'} ${whole} = ${whole} × ${percent}/100 = ${percent * whole / 100}.`,
    inputHint: ru ? 'Введи число.' : 'Enter a number.'
  };
}

function numericAnswer(value) {
  const input = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d+)?|\.\d+))?$/.test(input)) return null;
  const [numerator, denominator = 1] = input.split('/').map(Number);
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

async function ownedProblem(env, user, id) {
  const row = await env.DB.prepare('SELECT * FROM practice_problems WHERE id=? AND user_id=?').bind(id, user.id).first();
  if (!row) throw new HttpError(404, 'PROBLEM_NOT_FOUND', 'Start a new practice question.');
  return row;
}

export async function problem(env, request, user) {
  await rate(env, `problem:${user.id}`, 120, 3600);
  const params = new URL(request.url).searchParams;
  const selected = topic(params.get('topic') || 'fractions');
  const language = params.get('language') === 'ru' ? 'ru' : 'en';
  const generated = makeProblem(selected, language);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO practice_problems (id,user_id,topic,prompt,expected,hint,explanation,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(id, user.id, selected, generated.prompt, generated.expected, generated.hint,
    generated.explanation, nowIso()).run();
  return json({ problem: { id, topic: selected, prompt: generated.prompt, inputHint: generated.inputHint } });
}

export async function answer(env, request, user) {
  const input = await body(request, 4096);
  const problemId = text(input.problemId, 'Problem', 80, 1);
  const row = await ownedProblem(env, user, problemId);
  const submitted = text(String(input.answer ?? ''), 'Answer', 80, 1);
  const value = numericAnswer(submitted);
  if (value === null) throw new HttpError(400, 'INVALID_ANSWER', 'Enter a number or a fraction such as 3/4.');
  let assignmentId = null;
  if (input.assignmentId) {
    assignmentId = text(input.assignmentId, 'Assignment', 80, 1);
    const assignment = await env.DB.prepare('SELECT * FROM assignments WHERE id=? AND student_id=?').bind(assignmentId, user.id).first();
    if (!assignment) throw new HttpError(404, 'ASSIGNMENT_NOT_FOUND', 'That assignment was not found.');
    if (assignment.topic !== row.topic) throw new HttpError(400, 'ASSIGNMENT_TOPIC_MISMATCH', 'This question is for a different assignment topic.');
  }
  const correct = Math.abs(value - numericAnswer(row.expected)) < 1e-8;
  const id = crypto.randomUUID();
  const statements = [env.DB.prepare(`INSERT OR IGNORE INTO practice_results
    (id,problem_id,user_id,assignment_id,answer,correct,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(id, problemId, user.id, assignmentId, submitted, Number(correct), nowIso())];
  if (assignmentId) {
    statements.push(env.DB.prepare(`UPDATE assignments SET completed_count=completed_count+1,correct_count=correct_count+?
      WHERE id=? AND student_id=? AND completed_count<target_count
      AND EXISTS (SELECT 1 FROM practice_results WHERE id=?)`).bind(Number(correct), assignmentId, user.id, id));
  }
  await env.DB.batch(statements);
  const result = await env.DB.prepare('SELECT * FROM practice_results WHERE problem_id=? AND user_id=?').bind(problemId, user.id).first();
  return json({ correct: Boolean(result.correct), expectedAnswer: row.expected, explanation: row.explanation, duplicate: result.id !== id });
}

export async function hint(env, request, user) {
  await rate(env, `hint:${user.id}`, 30, 3600);
  const input = await body(request, 4096);
  const row = await ownedProblem(env, user, text(input.problemId, 'Problem', 80, 1));
  const fallback = { hint: row.hint, checkedHint: row.hint, source: 'checked' };
  if (!env.AI || !env.AI_MODEL) return json(fallback);
  try {
    await rate(env, `ai:${user.id}`, 10, 86400);
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) return json({ ...fallback, quotaReached: true });
    throw error;
  }
  try {
    const result = await env.AI.run(env.AI_MODEL, {
      messages: [
        { role: 'system', content: `You are a concise maths practice coach. Give a single friendly hint, not the final answer. Use only the provided verified maths and do not ask for personal details. Do not claim to be a human teacher. Plain text only, at most 100 words. Reply in ${/[а-яё]/i.test(row.prompt) ? 'Russian' : 'English'}.` },
        { role: 'user', content: `Question: ${row.prompt}\nVerified hint: ${row.hint}\nRephrase the hint clearly without solving it.` }
      ],
      max_tokens: 192
    });
    const generated = typeof result?.response === 'string' ? result.response.trim().slice(0, 1400) : '';
    if (generated) return json({ hint: generated, checkedHint: row.hint, source: 'ai' });
  } catch {
    // The independently checked hint remains available when inference fails.
  }
  return json(fallback);
}

export async function dashboard(env, user) {
  const tutor = user.role === 'tutor';
  const resultScope = tutor
    ? `r.user_id IN (SELECT m.student_id FROM memberships m JOIN classrooms c ON c.id=m.classroom_id WHERE c.tutor_id=?)`
    : 'r.user_id=?';
  const summary = await env.DB.prepare(`SELECT COUNT(*) AS attempts,COALESCE(SUM(r.correct),0) AS correct
    FROM practice_results r WHERE ${resultScope}`).bind(user.id).first();
  const topics = await all(env.DB, `SELECT p.topic,COUNT(*) AS attempts,SUM(r.correct) AS correct
    FROM practice_results r JOIN practice_problems p ON p.id=r.problem_id WHERE ${resultScope} GROUP BY p.topic`, user.id);
  const recent = await all(env.DB, `SELECT r.id,p.topic,p.prompt,r.correct,r.created_at AS createdAt
    FROM practice_results r JOIN practice_problems p ON p.id=r.problem_id WHERE ${resultScope} ORDER BY r.created_at DESC LIMIT 10`, user.id);
  const assignmentScope = tutor ? 'tutor_id' : 'student_id';
  const assignmentCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM assignments WHERE ${assignmentScope}=?`).bind(user.id).first();
  const reviewCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM reviews WHERE ${assignmentScope}=? AND status='open'`).bind(user.id).first();
  const active = tutor ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM memberships m JOIN classrooms c ON c.id=m.classroom_id WHERE c.tutor_id=?`).bind(user.id).first() : null;
  return json({
    stats: { attempts: summary.attempts, correct: summary.correct,
      accuracy: summary.attempts ? Math.round(summary.correct / summary.attempts * 100) : 0,
      activeStudents: active?.count || 0, assignments: assignmentCount.count, openReviews: reviewCount.count },
    topics: TOPICS.map(id => {
      const item = topics.find(value => value.topic === id) || { topic: id, attempts: 0, correct: 0 };
      return { ...item, accuracy: item.attempts ? Math.round(item.correct / item.attempts * 100) : 0 };
    }),
    recent: recent.map(item => ({ ...item, correct: Boolean(item.correct) }))
  });
}
