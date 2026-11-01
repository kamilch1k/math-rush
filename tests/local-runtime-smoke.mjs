// Run explicitly against the local Wrangler preview, never a production host.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:8787';
const suffix = Date.now().toString(36);
const teacher = { cookie: '' }, student = { cookie: '' };
async function call(actor, path, method = 'GET', body) {
  const response = await fetch(base + path, { method,
    headers: { Origin: base, Cookie: actor.cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const cookie = response.headers.get('set-cookie');
  if (cookie) actor.cookie = cookie.split(';')[0];
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${data.code || ''}`);
  return data;
}
for (const [actor, role] of [[teacher, 'tutor'], [student, 'learner']]) {
  actor.user = (await call(actor, '/api/auth/register', 'POST', {
    username: `qa_${role}_${suffix}`, displayName: `Local demo ${role}`,
    password: 'Local-preview-only-passphrase-1101!'
  })).user;
}
await call(teacher, '/api/tutor/activate', 'POST', { inviteCode: 'local-math-rush-demo-1101' });
const { classroom } = await call(teacher, '/api/classroom');
await call(student, '/api/classroom/join', 'POST', { code: classroom.code });
const { assignment } = await call(teacher, '/api/assignments', 'POST', {
  studentId: student.user.id, title: 'Local equations practice', topic: 'equations', targetCount: 2
});
const { problem } = await call(student, '/api/practice/problem?topic=equations&language=en');
const [a, b, c] = problem.prompt.match(/\d+/g).map(Number);
const answer = String((c - b) / a);
const result = await call(student, '/api/practice/answer', 'POST', { problemId: problem.id, answer, assignmentId: assignment.id });
assert.equal(result.correct, true);
await call(student, '/api/practice/answer', 'POST', { problemId: problem.id, answer, assignmentId: assignment.id });
assert.equal((await call(teacher, '/api/assignments')).assignments[0].completedCount, 1);
const { review } = await call(student, '/api/reviews', 'POST', { topic: 'Equations', question: 'Please check the inverse operations.', work: 'Subtract the constant, then divide by the coefficient.' });
await call(teacher, `/api/reviews/${review.id}`, 'PATCH', { feedback: 'Those inverse operations are correct. Keep both sides equal at each step.' });
assert.equal((await call(student, '/api/reviews')).reviews[0].status, 'reviewed');
assert.equal((await call(student, '/api/dashboard')).stats.attempts, 1);
const hint = await call(student, '/api/practice/hint', 'POST', { problemId: problem.id });
assert.equal(hint.source, 'checked');
console.log('PASS: local Workerd/D1 accounts, tutor activation, classroom, assignment, idempotent grading, written feedback, statistics, checked hints.');
