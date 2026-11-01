PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'tutor')),
  goal TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  languages TEXT NOT NULL DEFAULT '[]',
  public_profile INTEGER NOT NULL DEFAULT 0 CHECK (public_profile IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classrooms (
  id TEXT PRIMARY KEY,
  tutor_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memberships_classroom ON memberships(classroom_id);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  tutor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (topic IN ('fractions', 'equations', 'percentages')),
  target_count INTEGER NOT NULL CHECK (target_count BETWEEN 1 AND 100),
  completed_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assignments_student ON assignments(student_id, created_at);
CREATE INDEX IF NOT EXISTS assignments_tutor ON assignments(tutor_id, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  tutor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  work TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS reviews_tutor ON reviews(tutor_id, created_at);
CREATE INDEX IF NOT EXISTS reviews_student ON reviews(student_id, created_at);

CREATE TABLE IF NOT EXISTS practice_problems (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expected TEXT NOT NULL,
  hint TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS problems_user ON practice_problems(user_id, created_at);
CREATE TABLE IF NOT EXISTS practice_results (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL UNIQUE REFERENCES practice_problems(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS results_user ON practice_results(user_id, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  slot INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (key, slot)
);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limits(expires_at);
