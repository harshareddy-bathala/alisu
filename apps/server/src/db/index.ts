import pg from 'pg'

let _pool: pg.Pool | null = null

export function getPool(): pg.Pool | null {
  return _pool
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS calls (
  call_sid             TEXT PRIMARY KEY,
  status               TEXT    NOT NULL DEFAULT 'active',
  transcript           TEXT    NOT NULL DEFAULT '',
  last_chunk           TEXT    NOT NULL DEFAULT '',
  intent               TEXT    NOT NULL DEFAULT '',
  department           TEXT    NOT NULL DEFAULT '',
  urgency              TEXT    NOT NULL DEFAULT 'low',
  sentiment            TEXT    NOT NULL DEFAULT 'calm',
  needs_human          BOOLEAN NOT NULL DEFAULT false,
  language             TEXT    NOT NULL DEFAULT 'kn',
  verify_attempts      INTEGER NOT NULL DEFAULT 0,
  verification_sentence TEXT   NOT NULL DEFAULT '',
  audio_path           TEXT,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at             TIMESTAMPTZ,
  caller_number        TEXT    NOT NULL DEFAULT '',
  deleted_at           TIMESTAMPTZ,
  conversation_history JSONB   NOT NULL DEFAULT '[]',
  conversation_step    TEXT    NOT NULL DEFAULT 'gather',
  follow_up_count      INTEGER NOT NULL DEFAULT 0,
  complaint_id         TEXT,
  complaint_data       JSONB,
  irrelevant_count     INTEGER NOT NULL DEFAULT 0,
  priority             TEXT    NOT NULL DEFAULT 'low',
  is_resolved          BOOLEAN NOT NULL DEFAULT false,
  human_requested      BOOLEAN NOT NULL DEFAULT false,
  recording_path       TEXT,
  callback_time        TEXT
);

CREATE TABLE IF NOT EXISTS complaints (
  id                TEXT PRIMARY KEY,
  call_sid          TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',
  priority          TEXT NOT NULL DEFAULT 'low',
  department        TEXT NOT NULL DEFAULT '',
  issue_summary     TEXT NOT NULL DEFAULT '',
  location          TEXT,
  requested_action  TEXT,
  full_description  TEXT,
  language          TEXT NOT NULL DEFAULT 'kn',
  caller_number     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  resolution_notes  TEXT,
  status_history    JSONB NOT NULL DEFAULT '[]',
  deleted_at        TIMESTAMPTZ,
  callback_time     TEXT
);

CREATE INDEX IF NOT EXISTS idx_calls_started_at   ON calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_active        ON calls(started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_dept     ON complaints(department);
CREATE INDEX IF NOT EXISTS idx_complaints_status   ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created  ON complaints(created_at DESC);
`

export async function initDB(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log('[DB] DATABASE_URL not set — running with in-memory store only')
    return
  }

  _pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
    max: 10,
  })

  _pool.on('error', (err) => console.error('[DB] idle client error:', err))

  await _pool.query(SCHEMA)
  console.log('[DB] PostgreSQL connected and schema applied')
}
