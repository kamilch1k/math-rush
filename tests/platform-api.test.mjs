import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/src/index.js';
import { rate } from '../worker/src/http.js';

// Exercise the actual handlers against SQLite, using the same prepared-statement
// and transactional batch contract as D1. No mock authorization or grading code.
class Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.values);
    return row ? (column ? row[column] : { ...row }) : null;
  }
  async all() {
    const rows = this.db.prepare(this.sql).all(...this.values).map(row => ({ ...row }));
    return { success: true, results: rows, meta: { changes: 0 } };
  }
  execute() {
    const stmt = this.db.prepare(this.sql);
    if (stmt.columns().length) {
      const results = stmt.all(...this.values).map(row => ({ ...row }));
      return { success: true, results, meta: { changes: results.length } };
    }
    const result = stmt.run(...this.values);
    return {
      success: true, results: [],
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
    };
  }
  async run() { return this.execute(); }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../worker/migrations/0001_platform.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare: sql => new Statement(sqlite, sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql) { sqlite.exec(sql); return { count: 1, duration: 0 }; }
  };
  const env = { DB, TUTOR_INVITE_CODE: 'test-tutor-secret-123456789' };
  let ip = 0;
  function client() {
    const clientIp = `192.0.2.${++ip}`;
    let cookie = '';
    return {
      get cookie() { return cookie; },
      set cookie(value) { cookie = value; },
      async request(path, method = 'GET', body, extra = {}) {
        const headers = {
          Origin: 'https://math.test', 'CF-Connecting-IP': clientIp,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(cookie ? { Cookie: cookie } : {}), ...extra
        };
        const response = await worker.fetch(new Request(`https://math.test${path}`, {
          method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
        }), env, { waitUntil() {} });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, data, headers: response.headers };
      }
    };
  }
  async function register(username, who = client()) {
    const response = await who.request('/api/auth/register', 'POST', {
      username, displayName: username, password: 'Correct Horse Battery 21!'
    });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return { client: who, ...response.data };
  }
  return { sqlite, DB, env, client, register, close: () => sqlite.close() };
}

function pauseUserSnapshots(DB, count) {
  const originalPrepare = DB.prepare;
  let remaining = count;
  let readyResolve, releaseResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const released = new Promise(resolve => { releaseResolve = resolve; });
  DB.prepare = sql => {
    const statement = originalPrepare(sql);
    if (/^SELECT \* FROM users WHERE username\s*=\s*\?$/i.test(sql.trim())) {
      const originalBind = statement.bind.bind(statement);
      statement.bind = (...args) => {
        const bound = originalBind(...args);
        const originalFirst = bound.first.bind(bound);
        bound.first = async (...columns) => {
          if (remaining <= 0) return originalFirst(...columns);
          remaining--;
          const snapshot = await originalFirst(...columns);
          if (remaining === 0) readyResolve();
          await released;
          return snapshot;
        };
        return bound;
      };
    }
    return statement;
  };
  return { ready, release: () => releaseResolve(), restore: () => { DB.prepare = originalPrepare; } };
}

test('sessions keep credentials private and reject cross-site mutations', async t => {
  const f = fixture(); t.after(f.close);
  const student = await f.register('learner_one');
  assert.ok(student.user.id);
  assert.equal(student.user.role, 'student');
  assert.equal(student.user.password, undefined);
  assert.equal(student.user.passwordHash, undefined);
  assert.ok(student.recoveryCode?.length >= 20);
  const session = await student.client.request('/api/me');
  assert.equal(session.status, 200);
  assert.equal(session.data.user.id, student.user.id);
  const privateRow = f.sqlite.prepare('SELECT password_hash,password_salt,recovery_hash FROM users WHERE id=?').get(student.user.id);
  const visibleSession = JSON.stringify(session.data);
  for (const secret of ['Correct Horse Battery 21!', student.recoveryCode, f.env.TUTOR_INVITE_CODE, ...Object.values(privateRow)]) {
    assert.ok(!visibleSession.includes(secret), 'ordinary account responses must not expose secrets');
  }
  const rejected = await student.client.request('/api/profile', 'PATCH', { displayName: 'Changed' }, { Origin: 'https://evil.test' });
  assert.equal(rejected.status, 403);
  const shortPass = await f.client().request('/api/auth/register', 'POST', {
    username: 'short_password', displayName: 'Safe alias', password: '1234'
  });
  assert.equal(shortPass.status, 400);
  const login = f.client();
  const invalid = await login.request('/api/auth/login', 'POST', { username: 'learner_one', password: 'Wrong Password 21!' });
  assert.equal(invalid.status, 401);
  const valid = await login.request('/api/auth/login', 'POST', { username: 'learner_one', password: 'Correct Horse Battery 21!' });
  assert.equal(valid.status, 200);
  assert.match(valid.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(valid.headers.get('set-cookie'), /SameSite=(Lax|Strict)/i);
  assert.match(valid.headers.get('set-cookie'), /Secure/i);
  const logout = await login.request('/api/auth/logout', 'POST', {});
  assert.equal(logout.status, 200);
  const afterLogout = await login.request('/api/me');
  assert.equal(afterLogout.data.user, null);
});

test('cloud progress uses an account-bound optimistic revision', async t => {
  const f = fixture(); t.after(f.close);
  const a = await f.register('progress_a');
  const b = await f.register('progress_b');
  const empty = await a.client.request('/api/progress');
  assert.equal(empty.status, 200);
  assert.equal(empty.data.revision, 0);
  assert.equal(empty.data.progress, null);
  const progress = {
    version: 2, totalXp: 10, attempts: [], streakDays: 1, lastActiveDate: '2026-11-01',
    skills: { fractions: { xp: 10, attempts: 1, correctAttempts: 1, recentAttempts: [] } }
  };
  const saved = await a.client.request('/api/progress', 'PUT', { progress, revision: 0 });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.revision, 1);
  const stale = await a.client.request('/api/progress', 'PUT', { progress: { ...progress, totalXp: 0 }, revision: 0 });
  assert.equal(stale.status, 409);
  const loaded = await a.client.request('/api/progress');
  assert.equal(loaded.data.progress.totalXp, 10);
  assert.deepEqual(loaded.data.progress.skills.fractions.recentAttempts, []);
  assert.equal((await b.client.request('/api/progress')).data.progress, null);
  const contenders = await Promise.all([20, 30].map(totalXp =>
    a.client.request('/api/progress', 'PUT', { progress: { ...progress, totalXp }, revision: 1 })));
  assert.deepEqual(contenders.map(result => result.status).sort(), [200, 409]);
  const newest = await a.client.request('/api/progress');
  assert.equal(newest.data.revision, 2);
  assert.equal(newest.data.progress.totalXp, contenders.find(result => result.status === 200).data.progress.totalXp);
});

test('tutor access requires a secret and public listing requires a separate opt-in', async t => {
  const f = fixture(); t.after(f.close);
  const tutor = await f.register('teacher_one');
  assert.equal((await tutor.client.request('/api/tutor/activate', 'POST', { inviteCode: 'wrong-code' })).status, 403);
  const activated = await tutor.client.request('/api/tutor/activate', 'POST', { inviteCode: f.env.TUTOR_INVITE_CODE });
  assert.equal(activated.status, 200, JSON.stringify(activated.data));
  assert.equal(activated.data.user.role, 'tutor');
  const anonymous = f.client();
  assert.equal((await anonymous.request('/api/tutors')).data.tutors.length, 0);
  const profile = await tutor.client.request('/api/profile', 'PATCH', {
    displayName: 'Test Tutor', bio: 'Mathematics practice', languages: ['English'], publicProfile: true
  });
  assert.equal(profile.status, 200, JSON.stringify(profile.data));
  const listed = await anonymous.request('/api/tutors');
  assert.equal(listed.data.tutors.length, 1);
  assert.equal(listed.data.tutors[0].displayName, 'Test Tutor');
  assert.equal(listed.data.tutors[0].username, undefined, 'public listings do not disclose account identifiers');
});

test('classroom membership scopes assignments and human feedback', async t => {
  const f = fixture(); t.after(f.close);
  const tutor = await f.register('class_tutor');
  const student = await f.register('class_student');
  const outsider = await f.register('other_student');
  const otherTutor = await f.register('other_tutor');
  await tutor.client.request('/api/tutor/activate', 'POST', { inviteCode: f.env.TUTOR_INVITE_CODE });
  await otherTutor.client.request('/api/tutor/activate', 'POST', { inviteCode: f.env.TUTOR_INVITE_CODE });
  const classroom = await tutor.client.request('/api/classroom');
  assert.equal(classroom.status, 200);
  assert.ok(classroom.data.classroom.code.length >= 16);
  assert.equal(classroom.data.members.length, 0);
  assert.equal((await student.client.request('/api/assignments', 'POST', {
    title: 'Privilege escalation', topic: 'fractions', targetCount: 3, studentId: outsider.user.id
  })).status, 403);
  const rejectedAssignment = await tutor.client.request('/api/assignments', 'POST', {
    title: 'Not connected', topic: 'fractions', targetCount: 3, studentId: outsider.user.id
  });
  assert.ok([403, 404].includes(rejectedAssignment.status), JSON.stringify(rejectedAssignment.data));
  const joined = await student.client.request('/api/classroom/join', 'POST', { code: classroom.data.classroom.code });
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  const studentClassroom = await student.client.request('/api/classroom');
  assert.equal(studentClassroom.data.classroom.code, undefined, 'student responses do not expose tutor invite codes');
  const teacherClassroom = await tutor.client.request('/api/classroom');
  assert.equal(teacherClassroom.data.members.length, 1);
  assert.equal(teacherClassroom.data.members[0].id, student.user.id);
  const created = await tutor.client.request('/api/assignments', 'POST', {
    title: 'Fractions practice', topic: 'fractions', targetCount: 3, studentId: student.user.id, dueDate: '2027-01-20'
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.ok(created.data.assignment.id);
  const assigned = await student.client.request('/api/assignments');
  assert.equal(assigned.data.assignments.length, 1);
  assert.equal(assigned.data.assignments[0].id, created.data.assignment.id);
  assert.equal((await outsider.client.request('/api/assignments')).data.assignments.length, 0);
  assert.equal((await otherTutor.client.request('/api/assignments')).data.assignments.length, 0);
  const noTutor = await outsider.client.request('/api/reviews', 'POST', {
    topic: 'fractions', question: 'Why are common denominators useful?', work: 'I tried 1/2 + 1/3 = 2/5.'
  });
  assert.ok([400, 403, 409].includes(noTutor.status));
  const review = await student.client.request('/api/reviews', 'POST', {
    topic: 'fractions', question: 'Why are common denominators useful?', work: 'I tried 1/2 + 1/3 = 2/5.'
  });
  assert.equal(review.status, 201, JSON.stringify(review.data));
  assert.ok(review.data.review.id);
  assert.equal((await outsider.client.request('/api/reviews')).data.reviews.length, 0);
  assert.equal((await otherTutor.client.request('/api/reviews')).data.reviews.length, 0);
  const id = review.data.review.id;
  assert.ok([403, 404].includes((await otherTutor.client.request(`/api/reviews/${id}`, 'PATCH', { feedback: 'Unauthorized feedback' })).status));
  assert.ok([403, 404].includes((await outsider.client.request(`/api/reviews/${id}`, 'PATCH', { feedback: 'Unauthorized feedback' })).status));
  const feedback = await tutor.client.request(`/api/reviews/${id}`, 'PATCH', {
    feedback: 'Use sixths: 1/2 = 3/6 and 1/3 = 2/6, so the sum is 5/6.'
  });
  assert.equal(feedback.status, 200, JSON.stringify(feedback.data));
  const studentReviews = await student.client.request('/api/reviews');
  assert.match(studentReviews.data.reviews[0].feedback, /5\/6/);
});

test('account recovery rotates sessions and invalidates its one-time code', async t => {
  const f = fixture(); t.after(f.close);
  const student = await f.register('recover_student');
  const originalCookie = student.client.cookie;
  const recoveryClient = f.client();
  const recovered = await recoveryClient.request('/api/auth/recover', 'POST', {
    username: 'recover_student', recoveryCode: student.recoveryCode, password: 'New Strong Password 456!'
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
  assert.equal(recovered.data.user.id, student.user.id);
  assert.ok(recovered.data.recoveryCode);
  assert.notEqual(recovered.data.recoveryCode, student.recoveryCode);
  student.client.cookie = originalCookie;
  assert.equal((await student.client.request('/api/me')).data.user, null);
  assert.equal((await recoveryClient.request('/api/me')).data.user.id, student.user.id);
  const reused = await f.client().request('/api/auth/recover', 'POST', {
    username: 'recover_student', recoveryCode: student.recoveryCode, password: 'Another Strong Password 456!'
  });
  assert.equal(reused.status, 401);
  const newLogin = await f.client().request('/api/auth/login', 'POST', {
    username: 'recover_student', password: 'New Strong Password 456!'
  });
  assert.equal(newLogin.status, 200);
});

test('a login paused on old credentials cannot create a session after recovery', { timeout: 5000 }, async t => {
  const f = fixture(); t.after(f.close);
  const student = await f.register('racing_login');
  const oldLogin = f.client();
  const gate = pauseUserSnapshots(f.DB, 1);
  t.after(() => { gate.restore(); gate.release(); });
  const pendingLogin = oldLogin.request('/api/auth/login', 'POST', {
    username: 'racing_login', password: 'Correct Horse Battery 21!'
  });
  await gate.ready;
  gate.restore();
  const recoveredClient = f.client();
  const recovered = await recoveredClient.request('/api/auth/recover', 'POST', {
    username: 'racing_login', recoveryCode: student.recoveryCode, password: 'Recovered Strong Passphrase 234!'
  });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
  gate.release();
  const staleLogin = await pendingLogin;
  assert.equal(staleLogin.status, 401, JSON.stringify(staleLogin.data));
  assert.equal(staleLogin.data.code, 'CREDENTIALS_CHANGED');
  assert.equal(staleLogin.headers.get('set-cookie'), null);
  assert.equal((await oldLogin.request('/api/me')).data.user, null);
  assert.equal((await student.client.request('/api/me')).data.user, null);
  assert.equal((await recoveredClient.request('/api/me')).data.user.id, student.user.id);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(student.user.id).n, 1);
});

test('concurrent recovery uses the old code once and preserves the winning session', { timeout: 5000 }, async t => {
  const f = fixture(); t.after(f.close);
  const student = await f.register('racing_recovery');
  const first = f.client(), second = f.client();
  const gate = pauseUserSnapshots(f.DB, 2);
  t.after(() => { gate.restore(); gate.release(); });
  const requests = [first, second].map((client, index) => client.request('/api/auth/recover', 'POST', {
    username: 'racing_recovery', recoveryCode: student.recoveryCode,
    password: `Recovery Candidate ${index + 1} Passphrase!`
  }));
  await gate.ready;
  gate.restore();
  gate.release();
  const results = await Promise.all(requests);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? first : second;
  const loser = results[0].status === 409 ? first : second;
  assert.equal((await winner.request('/api/me')).data.user.id, student.user.id);
  assert.equal((await loser.request('/api/me')).data.user, null);
  assert.equal((await student.client.request('/api/me')).data.user, null);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(student.user.id).n, 1);
  const reused = await f.client().request('/api/auth/recover', 'POST', {
    username: 'racing_recovery', recoveryCode: student.recoveryCode, password: 'Old Code Cannot Reset Again 234!'
  });
  assert.equal(reused.status, 401);
  assert.equal((await winner.request('/api/me')).data.user.id, student.user.id, 'rejected recovery cannot delete the winning session');
});

test('malformed or oversized input fails safely and unauthenticated records stay private', async t => {
  const f = fixture(); t.after(f.close);
  const anonymous = f.client();
  for (const path of ['/api/progress', '/api/classroom', '/api/assignments', '/api/reviews', '/api/dashboard']) {
    assert.equal((await anonymous.request(path)).status, 401, path);
  }
  const malformed = await anonymous.request('/api/auth/register', 'POST', '{"username":');
  assert.equal(malformed.status, 400);
  const noOrigin = await anonymous.request('/api/auth/register', 'POST', {}, { Origin: '' });
  assert.equal(noOrigin.status, 403);
  const student = await f.register('bounded_student');
  const oversized = await student.client.request('/api/profile', 'PATCH', { bio: 'x'.repeat(300_000) });
  assert.equal(oversized.status, 413);
  const profile = await student.client.request('/api/me');
  assert.equal(profile.data.user.displayName, 'bounded_student');
  assert.equal(profile.headers.get('cache-control'), 'no-store');
});

test('server grading owns results, rejects stolen problems and counts assignment progress once', async t => {
  const f = fixture(); t.after(f.close);
  const tutor = await f.register('practice_tutor');
  const student = await f.register('practice_student');
  const outsider = await f.register('practice_outsider');
  await tutor.client.request('/api/tutor/activate', 'POST', { inviteCode: f.env.TUTOR_INVITE_CODE });
  const classroom = await tutor.client.request('/api/classroom');
  await student.client.request('/api/classroom/join', 'POST', { code: classroom.data.classroom.code });
  const assigned = await tutor.client.request('/api/assignments', 'POST', {
    title: 'Checked fractions', topic: 'fractions', targetCount: 3, studentId: student.user.id
  });
  assert.equal(assigned.status, 201, JSON.stringify(assigned.data));
  const assignmentId = assigned.data.assignment.id;
  const generated = await student.client.request('/api/practice/problem?topic=fractions');
  assert.equal(generated.status, 200, JSON.stringify(generated.data));
  const problem = generated.data.problem;
  assert.equal(problem.topic, 'fractions');
  assert.ok(problem.prompt);
  assert.equal(problem.expected, undefined, 'the problem does not disclose its answer before submission');
  const expected = f.sqlite.prepare('SELECT expected FROM practice_problems WHERE id = ?').get(problem.id).expected;
  const stolen = await outsider.client.request('/api/practice/answer', 'POST', {
    problemId: problem.id, answer: expected, assignmentId
  });
  assert.equal(stolen.status, 404);
  const stolenHint = await outsider.client.request('/api/practice/hint', 'POST', { problemId: problem.id });
  assert.equal(stolenHint.status, 404);
  const outsiderProblem = (await outsider.client.request('/api/practice/problem?topic=fractions')).data.problem;
  const outsiderAnswer = f.sqlite.prepare('SELECT expected FROM practice_problems WHERE id = ?').get(outsiderProblem.id).expected;
  const stolenAssignment = await outsider.client.request('/api/practice/answer', 'POST', {
    problemId: outsiderProblem.id, answer: outsiderAnswer, assignmentId
  });
  assert.ok([403, 404].includes(stolenAssignment.status), JSON.stringify(stolenAssignment.data));
  const hint = await student.client.request('/api/practice/hint', 'POST', { problemId: problem.id });
  assert.equal(hint.status, 200);
  assert.equal(hint.data.source, 'checked', 'an unconfigured AI provider must not be advertised as active');
  assert.ok(hint.data.hint);
  const answer = await student.client.request('/api/practice/answer', 'POST', {
    problemId: problem.id, answer: expected, assignmentId
  });
  assert.equal(answer.status, 200, JSON.stringify(answer.data));
  assert.equal(answer.data.correct, true);
  assert.equal(answer.data.duplicate, false);
  const duplicate = await student.client.request('/api/practice/answer', 'POST', {
    problemId: problem.id, answer: '999999', assignmentId
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.duplicate, true);
  assert.equal(duplicate.data.correct, true, 'retries return the stored result instead of regrading');
  const assignment = (await student.client.request('/api/assignments')).data.assignments[0];
  assert.equal(assignment.completedCount, 1);
  assert.equal(assignment.correctCount, 1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM practice_results WHERE problem_id = ?').get(problem.id).n, 1);
  const concurrentProblem = (await student.client.request('/api/practice/problem?topic=fractions')).data.problem;
  const concurrentExpected = f.sqlite.prepare('SELECT expected FROM practice_problems WHERE id = ?').get(concurrentProblem.id).expected;
  const concurrent = await Promise.all([1, 2].map(() => student.client.request('/api/practice/answer', 'POST', {
    problemId: concurrentProblem.id, answer: concurrentExpected, assignmentId
  })));
  assert.deepEqual(concurrent.map(result => result.status), [200, 200]);
  assert.deepEqual(concurrent.map(result => result.data.duplicate).sort(), [false, true]);
  const afterConcurrent = (await student.client.request('/api/assignments')).data.assignments[0];
  assert.equal(afterConcurrent.completedCount, 2);
  assert.equal(afterConcurrent.correctCount, 2);
  const second = await student.client.request('/api/practice/problem?topic=equations');
  const mismatched = await student.client.request('/api/practice/answer', 'POST', {
    problemId: second.data.problem.id, answer: '1', assignmentId
  });
  assert.equal(mismatched.status, 400, 'a different topic cannot count toward the assignment');
  const dashboard = await student.client.request('/api/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal((await f.client().request('/api/practice/problem?topic=fractions')).status, 401);
});

test('rate limits persist in D1 across request environments', async t => {
  const f = fixture(); t.after(f.close);
  await rate(f.env, 'test:durable-rate', 2, 60);
  await rate({ DB: f.DB }, 'test:durable-rate', 2, 60);
  await assert.rejects(() => rate({ DB: f.DB }, 'test:durable-rate', 2, 60), error => error.status === 429);
  const row = f.sqlite.prepare('SELECT count FROM rate_limits WHERE key = ?').get('test:durable-rate');
  assert.equal(row.count, 2);
  await rate({ DB: f.DB }, 'test:other-account', 2, 60);
});

test('public API requires HTTPS while local development addresses remain usable', async t => {
  const f = fixture(); t.after(f.close);
  const insecure = await worker.fetch(new Request('http://math.test/api/capabilities'), f.env);
  assert.equal(insecure.status, 426);
  assert.equal((await insecure.json()).code, 'HTTPS_REQUIRED');
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const local = await worker.fetch(new Request(`http://${host}:8787/api/capabilities`), f.env);
    assert.equal(local.status, 200, host);
    assert.equal((await local.json()).database, true);
  }
  const localRegistration = await worker.fetch(new Request('http://localhost:8787/api/auth/register', {
    method: 'POST', headers: { Origin: 'http://localhost:8787', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'local_student', displayName: 'Local student', password: 'Local Test Passphrase 123!' })
  }), f.env);
  assert.equal(localRegistration.status, 201);
  assert.match(localRegistration.headers.get('set-cookie'), /HttpOnly/);
  assert.ok(!localRegistration.headers.get('set-cookie').includes('; Secure'), 'localhost HTTP can use its development session cookie');
});

test('AI hints identify their source and fall back to checked hints after the daily quota', async t => {
  const f = fixture(); t.after(f.close);
  const student = await f.register('ai_student');
  let calls = 0;
  f.env.AI_MODEL = '@test/math-model';
  f.env.AI = {
    async run(model, input) {
      calls++;
      assert.equal(model, '@test/math-model');
      const supplied = JSON.stringify(input);
      assert.ok(supplied.includes('Verified hint:'));
      assert.ok(!supplied.includes(student.recoveryCode));
      assert.ok(!supplied.includes(f.env.TUTOR_INVITE_CODE));
      assert.ok(!supplied.includes('ai_student'), 'AI only receives the exercise and checked hint, not the account identity');
      return { response: 'Try finding equal-sized parts before combining them.' };
    }
  };
  const problem = (await student.client.request('/api/practice/problem?topic=fractions')).data.problem;
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await student.client.request('/api/practice/hint', 'POST', { problemId: problem.id });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.source, 'ai');
    assert.equal(response.data.hint, 'Try finding equal-sized parts before combining them.');
    assert.ok(response.data.checkedHint);
  }
  assert.equal(calls, 10);
  const quota = await student.client.request('/api/practice/hint', 'POST', { problemId: problem.id });
  assert.equal(quota.status, 200, 'the deterministic hint remains available after the AI quota');
  assert.equal(quota.data.source, 'checked');
  assert.equal(quota.data.quotaReached, true);
  assert.equal(quota.data.hint, quota.data.checkedHint);
  assert.equal(calls, 10, 'quota exhaustion does not invoke the AI provider');
});

test('AI provider failures return checked help without leaking provider errors', async t => {
  const f = fixture(); t.after(f.close);
  const student = await f.register('ai_failure');
  f.env.AI_MODEL = '@test/failing-model';
  f.env.AI = { async run() { throw new Error('provider credential PRIVATE_TEST_TOKEN'); } };
  const problem = (await student.client.request('/api/practice/problem?topic=equations')).data.problem;
  const result = await student.client.request('/api/practice/hint', 'POST', { problemId: problem.id });
  assert.equal(result.status, 200);
  assert.equal(result.data.source, 'checked');
  assert.equal(result.data.hint, result.data.checkedHint);
  assert.ok(!JSON.stringify(result.data).includes('PRIVATE_TEST_TOKEN'));
  assert.equal(result.data.quotaReached, undefined, 'provider outages are distinct from quota exhaustion');
});
