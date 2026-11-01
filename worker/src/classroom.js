import { ensureClassroom } from './auth.js';
import { HttpError, all, body, integer, json, nowIso, rate, requireTutor, text, topic } from './http.js';

function tutorCard(row) {
  return { id: row.id, displayName: row.display_name, bio: row.bio,
    languages: JSON.parse(row.languages), subjects: ['Mathematics'] };
}

export async function tutors(env) {
  const rows = await all(env.DB, "SELECT id, display_name, bio, languages FROM users WHERE role='tutor' AND public_profile=1 ORDER BY display_name LIMIT 50");
  return json({ tutors: rows.map(tutorCard) });
}

async function studentClassroom(env, studentId) {
  return env.DB.prepare(`SELECT c.*, u.display_name, u.bio, u.languages
    FROM memberships m JOIN classrooms c ON c.id=m.classroom_id JOIN users u ON u.id=c.tutor_id
    WHERE m.student_id=?`).bind(studentId).first();
}

export async function classroom(env, user) {
  if (user.role === 'tutor') {
    const room = await ensureClassroom(env, user);
    const members = await all(env.DB, `SELECT u.id, u.username, u.display_name AS displayName, m.joined_at AS joinedAt
      FROM memberships m JOIN users u ON u.id=m.student_id WHERE m.classroom_id=? ORDER BY u.display_name LIMIT 200`, room.id);
    return json({ classroom: room, members });
  }
  const row = await studentClassroom(env, user.id);
  return json(row ? {
    classroom: { id: row.id, title: row.title, tutorId: row.tutor_id, tutorName: row.display_name },
    tutor: tutorCard({ ...row, id: row.tutor_id }), members: []
  } : { classroom: null, tutor: null, members: [] });
}

export async function joinClassroom(env, request, user) {
  if (user.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', 'Tutor accounts cannot join a student classroom.');
  await rate(env, `join:${user.id}`, 10, 3600);
  const input = await body(request, 4096);
  const code = text(input.code, 'Classroom code', 64, 1).toLowerCase();
  const room = await env.DB.prepare(`SELECT c.*,u.display_name FROM classrooms c JOIN users u ON u.id=c.tutor_id WHERE c.code=?`).bind(code).first();
  if (!room) throw new HttpError(404, 'CLASSROOM_NOT_FOUND', 'That classroom code was not found.');
  const current = await env.DB.prepare('SELECT classroom_id FROM memberships WHERE student_id=?').bind(user.id).first();
  if (current && current.classroom_id !== room.id) throw new HttpError(409, 'ALREADY_LINKED', 'This account is already linked to a different classroom.');
  await env.DB.prepare('INSERT OR IGNORE INTO memberships (student_id,classroom_id,joined_at) VALUES (?,?,?)')
    .bind(user.id, room.id, nowIso()).run();
  return json({ classroom: { id: room.id, title: room.title, tutorId: room.tutor_id, tutorName: room.display_name } });
}

const ASSIGNMENT_SELECT = `SELECT a.id,a.title,a.topic,a.target_count AS targetCount,
  a.completed_count AS completedCount,a.correct_count AS correctCount,a.student_id AS studentId,
  s.display_name AS studentName,a.tutor_id AS tutorId,t.display_name AS tutorName,
  a.due_date AS dueDate,a.created_at AS createdAt
  FROM assignments a JOIN users s ON s.id=a.student_id JOIN users t ON t.id=a.tutor_id`;

export async function assignments(env, user) {
  const scope = user.role === 'tutor' ? 'a.tutor_id' : 'a.student_id';
  return json({ assignments: await all(env.DB, `${ASSIGNMENT_SELECT} WHERE ${scope}=? ORDER BY a.created_at DESC LIMIT 200`, user.id) });
}

export async function createAssignment(env, request, user) {
  requireTutor(user);
  await rate(env, `assign:${user.id}`, 60, 3600);
  const input = await body(request, 8192);
  const studentId = text(input.studentId, 'Student', 80, 1);
  const membership = await env.DB.prepare(`SELECT m.student_id FROM memberships m JOIN classrooms c ON c.id=m.classroom_id
    WHERE m.student_id=? AND c.tutor_id=?`).bind(studentId, user.id).first();
  if (!membership) throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Choose a student in your classroom.');
  const title = text(input.title, 'Assignment title', 120, 1);
  const selectedTopic = topic(input.topic);
  const targetCount = integer(input.targetCount, 'Question count', 1, 100);
  let dueDate = null;
  if (input.dueDate) {
    dueDate = text(input.dueDate, 'Due date', 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate) {
      throw new HttpError(400, 'INVALID_DATE', 'Use a valid due date.');
    }
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO assignments (id,tutor_id,student_id,title,topic,target_count,due_date,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(id, user.id, studentId, title, selectedTopic, targetCount, dueDate, nowIso()).run();
  return json({ assignment: await env.DB.prepare(`${ASSIGNMENT_SELECT} WHERE a.id=?`).bind(id).first() }, 201);
}

const REVIEW_SELECT = `SELECT r.id,r.topic,r.question,r.work,r.feedback,r.status,r.student_id AS studentId,
  s.display_name AS studentName,r.tutor_id AS tutorId,t.display_name AS tutorName,
  r.created_at AS createdAt,r.reviewed_at AS reviewedAt
  FROM reviews r JOIN users s ON s.id=r.student_id JOIN users t ON t.id=r.tutor_id`;

export async function reviews(env, user) {
  const scope = user.role === 'tutor' ? 'r.tutor_id' : 'r.student_id';
  return json({ reviews: await all(env.DB, `${REVIEW_SELECT} WHERE ${scope}=? ORDER BY r.created_at DESC LIMIT 200`, user.id) });
}

export async function createReview(env, request, user) {
  if (user.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', 'Use a learner account to ask for feedback.');
  await rate(env, `reviews:${user.id}`, 10, 3600);
  const room = await studentClassroom(env, user.id);
  if (!room) throw new HttpError(409, 'CLASSROOM_REQUIRED', 'Join your tutor’s classroom before requesting human feedback.');
  const input = await body(request, 16384);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO reviews (id,tutor_id,student_id,topic,question,work,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(id, room.tutor_id, user.id, text(input.topic || 'Mathematics', 'Topic', 80, 1),
      text(input.question, 'Question', 2000, 1), text(input.work || '', 'Your working', 4000), nowIso()).run();
  return json({ review: await env.DB.prepare(`${REVIEW_SELECT} WHERE r.id=?`).bind(id).first() }, 201);
}

export async function reviewFeedback(env, request, user, id) {
  requireTutor(user);
  const row = await env.DB.prepare('SELECT id FROM reviews WHERE id=? AND tutor_id=?').bind(id, user.id).first();
  if (!row) throw new HttpError(404, 'REVIEW_NOT_FOUND', 'That feedback request was not found.');
  const input = await body(request, 16384);
  const feedback = text(input.feedback, 'Feedback', 4000, 1);
  await env.DB.prepare("UPDATE reviews SET feedback=?,status='reviewed',reviewed_at=? WHERE id=? AND tutor_id=?")
    .bind(feedback, nowIso(), id, user.id).run();
  return json({ review: await env.DB.prepare(`${REVIEW_SELECT} WHERE r.id=?`).bind(id).first() });
}
