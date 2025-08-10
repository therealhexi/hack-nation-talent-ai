import Database from 'better-sqlite3';
import path from 'path';

// Keep a singleton database connection during dev server lifetime
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbFilePath = path.join(process.cwd(), 'talent-ai.db');
  db = new Database(dbFilePath);
  db.pragma('journal_mode = WAL');
  bootstrapSchema(db);
  return db;
}

function bootstrapSchema(database: Database.Database) {
  const schemaSql = `
  CREATE TABLE IF NOT EXISTS candidate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_user_id TEXT UNIQUE NOT NULL,
    github_login TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    email TEXT,
    connected_at INTEGER NOT NULL,
    last_evaluated_at INTEGER,
    evaluation_status TEXT DEFAULT 'idle',
    evaluation_error TEXT
  );

  CREATE TABLE IF NOT EXISTS repo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL,
    repo_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    default_branch TEXT NOT NULL,
    private INTEGER NOT NULL CHECK (private IN (0,1)),
    stars INTEGER,
    forks INTEGER,
    language TEXT,
    pushed_at INTEGER,
    is_fork INTEGER NOT NULL CHECK (is_fork IN (0,1)),
    FOREIGN KEY (candidate_id) REFERENCES candidate(id)
  );

  CREATE TABLE IF NOT EXISTS commit_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    sha TEXT NOT NULL,
    message TEXT,
    committed_at INTEGER NOT NULL,
    author_name TEXT,
    author_login TEXT,
    FOREIGN KEY (repo_id) REFERENCES repo(id)
  );

  CREATE TABLE IF NOT EXISTS file_stat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    extension TEXT,
    last_modified_at INTEGER,
    FOREIGN KEY (repo_id) REFERENCES repo(id)
  );

  CREATE TABLE IF NOT EXISTS dependency (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    manager TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT,
    FOREIGN KEY (repo_id) REFERENCES repo(id)
  );

  CREATE TABLE IF NOT EXISTS repo_skill (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    skill TEXT NOT NULL,
    score REAL NOT NULL,
    reasoning TEXT,
    evidence JSON,
    FOREIGN KEY (repo_id) REFERENCES repo(id)
  );

  CREATE TABLE IF NOT EXISTS candidate_skill (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL,
    skill TEXT NOT NULL,
    score REAL NOT NULL,
    reasoning TEXT,
    embedding JSON,
    FOREIGN KEY (candidate_id) REFERENCES candidate(id)
  );

  CREATE TABLE IF NOT EXISTS job_posting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT NOT NULL,
    company TEXT,
    location_city TEXT,
    location_state TEXT,
    location_country TEXT,
    experience_level TEXT,
    years_of_experience TEXT,
    employment_type TEXT,
    posted_date_relative TEXT,
    tasks JSON,
    perks_benefits JSON,
    skills_tech_stack JSON,
    educational_requirements JSON,
    job_url TEXT,
    apply_url TEXT
  );

  CREATE TABLE IF NOT EXISTS job_skill_embedding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    skill TEXT NOT NULL,
    embedding JSON NOT NULL,
    FOREIGN KEY (job_id) REFERENCES job_posting(id)
  );

  CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT UNIQUE NOT NULL,
    df INTEGER NOT NULL,
    idf REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL,
    computed_at INTEGER NOT NULL,
    results JSON NOT NULL,
    FOREIGN KEY (candidate_id) REFERENCES candidate(id)
  );

  CREATE TABLE IF NOT EXISTS evaluation_job (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    progress INTEGER DEFAULT 0,
    error TEXT,
    FOREIGN KEY (candidate_id) REFERENCES candidate(id)
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `;

  database.exec(schemaSql);
}

export type SparseVector = Record<string, number>; // token -> weight

export function runInTransaction<T>(fn: (db: Database.Database) => T): T {
  const tx = getDb().transaction(fn);
  return tx(getDb());
} 