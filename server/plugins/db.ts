import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "floor-sessions-questions-votes",
      sql: `CREATE TABLE IF NOT EXISTS floor_sessions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  briefing TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'paused', 'ended')),
  stage_question_id TEXT,
  autopilot INTEGER NOT NULL DEFAULT 0,
  pulse TEXT,
  recap TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS floor_session_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS floor_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES floor_sessions(id),
  body TEXT NOT NULL,
  author_name TEXT,
  author_token TEXT NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'queued', 'answered', 'hidden')),
  duplicate_of TEXT,
  theme TEXT,
  rank INTEGER,
  note TEXT,
  answer TEXT,
  answer_state TEXT NOT NULL DEFAULT 'none' CHECK (answer_state IN ('none', 'draft', 'published')),
  answer_by TEXT CHECK (answer_by IN ('agent', 'host')),
  triaged_by TEXT CHECK (triaged_by IN ('agent', 'host')),
  triaged_at TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  CHECK (duplicate_of IS NULL OR duplicate_of <> id)
);
CREATE TABLE IF NOT EXISTS floor_votes (
  question_id TEXT NOT NULL REFERENCES floor_questions(id),
  voter_token TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  PRIMARY KEY (question_id, voter_token)
);
CREATE INDEX IF NOT EXISTS floor_sessions_owner_org_idx ON floor_sessions (owner_email, org_id, created_at);
CREATE INDEX IF NOT EXISTS floor_session_shares_resource_idx ON floor_session_shares (resource_id, principal_type, principal_id);
CREATE INDEX IF NOT EXISTS floor_questions_session_idx ON floor_questions (session_id, created_at);
CREATE INDEX IF NOT EXISTS floor_questions_author_idx ON floor_questions (session_id, author_token)`,
    },
  ],
  { table: "floor_app_migrations" },
);
