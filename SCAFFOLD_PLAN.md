## Talent AI – Scaffold Plan

### Goal
Build a local-demo-ready web app for candidates to connect GitHub, run a skills evaluation workflow using recent commit history and manifests, then match against ~100 preloaded job postings with explainable results. Keep dependencies minimal, store no code, and finishable in ~4 hours.


## High-level Architecture
- Next.js (App Router, TypeScript) monolith
- UI: Tailwind CSS (no component kit)
- Auth: NextAuth (GitHub OAuth), JWT session, `repo` scope for private-read
- DB: SQLite (file), direct SQL via `better-sqlite3` (no ORM)
- LLMs:
  - Per-repo skills analysis: Gemini (Google Generative AI) – frugal, code-context friendly
  - Embeddings for matching: Local TF-IDF vectorizer (unigrams+bigrams) with cosine similarity (no external API)
- Background workflow: Locally run as a detached async task; progress stored in SQLite, polled by client
- Data ingestion: Local NDJSON file `data/jobs.ndjson` → one-click admin endpoint to load into SQLite


## Key Constraints Observed
- Candidate-centric demo; employer features are public read-only
- Private repos allowed; exclude forks
- Analyze up to 25 repos, last 100 commits each, default branch only
- Store only metadata, commit messages, manifests-derived dependencies; do not store code
- Per-repo LLM skill extraction; aggregate to candidate-level with recency and frequency weighting
- Matching: cosine similarity on embeddings in memory (100 jobs × few candidates); store vectors in SQLite as JSON
- Target evaluation runtime ≤ 2 minutes


## Data Model (SQLite)
Tables are created at app boot if not present.

```sql
-- Users are implicit via GitHub auth; the candidate is keyed by GitHub user id
CREATE TABLE IF NOT EXISTS candidate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id TEXT UNIQUE NOT NULL,
  github_login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  email TEXT,
  connected_at INTEGER NOT NULL,
  last_evaluated_at INTEGER,
  evaluation_status TEXT DEFAULT 'idle', -- idle | running | success | error
  evaluation_error TEXT
);

CREATE TABLE IF NOT EXISTS repo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  repo_id TEXT NOT NULL,                 -- GitHub repo id
  full_name TEXT NOT NULL,               -- owner/name
  default_branch TEXT NOT NULL,
  private INTEGER NOT NULL CHECK (private IN (0,1)),
  stars INTEGER,
  forks INTEGER,
  language TEXT,                         -- primary language from GitHub
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

-- File-level metadata without storing code
CREATE TABLE IF NOT EXISTS file_stat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  extension TEXT,
  last_modified_at INTEGER,
  FOREIGN KEY (repo_id) REFERENCES repo(id)
);

-- Dependencies extracted from manifests (e.g., package.json, requirements.txt)
CREATE TABLE IF NOT EXISTS dependency (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  manager TEXT NOT NULL,                 -- npm, pip, poetry, pnpm, yarn, etc.
  name TEXT NOT NULL,
  version TEXT,
  FOREIGN KEY (repo_id) REFERENCES repo(id)
);

-- Per-repo skill outputs from Gemini
CREATE TABLE IF NOT EXISTS repo_skill (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  skill TEXT NOT NULL,                   -- dynamic skill name
  score REAL NOT NULL,                   -- 0..1 relevance within this repo
  reasoning TEXT,                        -- short explanation
  evidence JSON,                         -- JSON: {sources:["package.json dependencies", "commit messages"], notes:"..."}
  FOREIGN KEY (repo_id) REFERENCES repo(id)
);

-- Aggregated candidate-level skills after weighting
CREATE TABLE IF NOT EXISTS candidate_skill (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  skill TEXT NOT NULL,
  score REAL NOT NULL,                   -- final weighted score 0..1
  reasoning TEXT,                        -- merged reasoning across repos
  embedding JSON,                        -- Local TF-IDF sparse vector stored as JSON text
  FOREIGN KEY (candidate_id) REFERENCES candidate(id)
);

-- Jobs loaded from NDJSON file
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
  tasks JSON,                            -- JSON array
  perks_benefits JSON,                   -- JSON array
  skills_tech_stack JSON,                -- JSON array of strings
  educational_requirements JSON,         -- JSON array
  job_url TEXT,
  apply_url TEXT
);

CREATE TABLE IF NOT EXISTS job_skill_embedding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  skill TEXT NOT NULL,
  embedding JSON NOT NULL,               -- Local TF-IDF sparse vector as JSON
  FOREIGN KEY (job_id) REFERENCES job_posting(id)
);

-- Vocabulary for local TF-IDF
CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT UNIQUE NOT NULL,
  df INTEGER NOT NULL,
  idf REAL NOT NULL
);

-- Optional caching of last match results
CREATE TABLE IF NOT EXISTS match_result (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  computed_at INTEGER NOT NULL,
  results JSON NOT NULL,                 -- [{job_id, score, top_skills:[{skill, candidate_score, similarity}]}]
  FOREIGN KEY (candidate_id) REFERENCES candidate(id)
);

-- Evaluation job tracking for background progress
CREATE TABLE IF NOT EXISTS evaluation_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  status TEXT NOT NULL,                  -- queued | running | success | error
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  progress INTEGER DEFAULT 0,            -- 0..100
  error TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidate(id)
);
```


## GitHub Ingestion Workflow
1. Auth: NextAuth GitHub provider with `repo` scope; store `github_user_id`, `github_login`, avatar, etc.
2. Repo discovery:
   - List non-fork repos for the user via GitHub API (REST or GraphQL), sort by `pushed_at` desc, take top 25.
3. Per-repo commit metadata:
   - Default branch only; list last 100 commits.
   - Store `sha`, `message`, `committed_at` (no code blobs).
4. Light file metadata:
   - List a shallow tree to record file paths and extensions for coarse language signals.
   - Do NOT persist file contents.
5. Manifest parsing (read-only, ephemeral):
   - Fetch and parse `package.json`, `requirements.txt`, `pyproject.toml`, `poetry.lock`, `Pipfile`, `go.mod`, etc. Extract dependency names and versions; persist names/versions only.
6. Per-repo LLM skills (Gemini):
   - Prompt with signals: repo summary (name, primary language), top dependencies, commit message samples (most recent 30), and file extension histogram.
   - Output: dynamic skills [{skill, score(0..1), reasoning, evidence sources}], stored in `repo_skill`.


## Skill Aggregation and Weighting
- For each candidate, merge per-repo skills:
  - Recency weight: For each repo skill occurrence, compute weight by commit recency using exponential decay
    - Let age_days = min age among the repo’s recent commits
    - recency_weight = exp(-ln(2) * age_days / 30)  // 30-day half-life
  - Frequency weight: Normalize commit count per repo: commits_weight = min(1, commits_in_repo / 100)
  - Combined contribution per repo-skill: contribution = repo_skill_score × recency_weight × commits_weight
- Aggregate by skill: sum contributions across repos, clip to [0,1]
- Reasoning: concatenate top-2 repo reasonings with brief normalization
- Compute local TF-IDF vector for each aggregated skill string (using shared vocabulary) and store in `candidate_skill`.


## Matching Algorithm
- Inputs:
  - Candidate skills: [{skill, score, embedding}]
  - Job skills: `skills_tech_stack` (strings)
- Preprocessing:
  - For each job posting on load, compute local TF-IDF vectors for each job skill and store in `job_skill_embedding`.
- Matching per candidate:
  - For each job skill vector vj, compute cosine similarity with all candidate skill vectors ci; take max similarity m_j = max_i cos(vj, ci)
  - Weighted similarity contribution: w_j = m_j × candidate_score_of_argmax_ci
  - Job match score: average of w_j over all job skills; optionally emphasize top-k job skills (e.g., top 8) if list is long
- Explanation:
  - Report top overlapping skills: those with highest w_j, include similarity and candidate_score
  - Include short reasoning from candidate_skill.reasoning if available
- Output: top-5 jobs by score with links to `job_url`


## API Routes (App Router)
- Auth
  - `app/api/auth/[...nextauth]/route.ts` – NextAuth GitHub provider (JWT)

- Candidate
  - `POST app/api/candidate/evaluate` – starts/queues evaluation for current user; returns `{jobId}`
  - `GET app/api/candidate/evaluate/status?jobId=...` – returns `{status, progress, error}`
  - `GET app/api/candidate/skills` – returns aggregated candidate skills
  - `POST app/api/candidate/match` – computes matches now; returns top-5 jobs with explanations

- GitHub ingestion (internal helpers used by evaluate job)
  - Functions to: list repos, list commits, fetch manifests, persist metadata

- Jobs admin (local/demo)
  - `POST app/api/admin/load-jobs` – loads `data/jobs.ndjson` into `job_posting` and builds `job_skill_embedding`


## Pages and UX Flows
- `/` Landing
  - CTA: "Connect GitHub"

- `/candidates` (Candidate)
  - If authed: show profile card and buttons
    - Button: "Evaluate Skills" (starts job, shows progress bar; page polls status)
    - Section: Skills table – skill name, score badge, reasoning tooltip
    - Button: "Match Jobs" → triggers match and shows top-5 with scores and links
  - If not authed: show Connect GitHub

- `/jobs` (Public)
  - Table of jobs from DB: title, company, location, chip list for `skills_tech_stack`

- `/jobs/[id]` (Public)
  - Job details
  - "Top Candidates" list (up to 5) among those who evaluated: name, score, top overlapping skills, direct link to candidate GitHub profile

- UI Notes
  - Tailwind only
  - Keep components simple and accessible


## Prompts and LLM Usage
- Gemini per-repo prompt (sketch):
  - System: "You are deriving technical skills from a code repository using indirect evidence. Avoid guessing; be concise."
  - User content:
    - Repo metadata: name, primary language, stars, forks, recent pushed_at
    - Top dependencies (names only)
    - Recent commit messages (up to 30), with timestamps
    - File extension histogram (e.g., ts:120, py:15, go:0)
  - Ask Gemini to output JSON: `{ skills: [{ skill: string, score: number(0..1), reasoning: string, evidence: string[] }] }`
- Embeddings:
  - Local TF-IDF vectorizer (shared vocabulary built from job skills; vectors stored as JSON); compute per candidate skill and per job skill


## Rate Limits and Robustness
- Local demo focus; still implement:
  - Repo pagination safety
  - Try/catch per repo to keep progress moving
  - Partial results surfaced with retry button


## Security & Privacy
- Never persist raw code
- Only store: repo metadata, file paths/extensions, dependencies, commit messages/timestamps
- Private repos accessed read-only with candidate consent; tokens stored by NextAuth in JWT only (no DB)


## Environment Variables
- `GITHUB_ID`, `GITHUB_SECRET`
- `GOOGLE_API_KEY` (Gemini)
- `NEXTAUTH_SECRET`


## Minimal Dependencies
- `next`, `react`, `react-dom`
- `next-auth`
- `tailwindcss`, `postcss`, `autoprefixer`
- `better-sqlite3`
- `@google/generative-ai`
- Optional tiny utils: cosine similarity; simple tokenizer/normalizer implemented inline


## Implementation Steps (4-hour track)
1) Project setup (Next.js + TS, Tailwind, NextAuth) and SQLite bootstrap utils
2) DB schema bootstrap on server start (create tables if not exist)
3) Candidate dashboard shell without Auth. Stub the auth experience to make progress.
4) Jobs loader API + page (`/jobs`, `/jobs/[id]`) + build TF-IDF vocabulary from all job skills and store in `vocabulary`; precompute and store job skill vectors
5) Stub GitHub integration (hard-coded fixtures for repos, commits, manifests); mock progress updates
6) Gemini per-repo analysis + storage; aggregation using stubbed data; compute local TF-IDF vectors
7) Matching endpoint + UI display (cosine over local vectors)
8) Polish: progress polling, error states, demo script
9) Replace stubs with real auth flow to integrate with Github
10) Replace stubs with real GitHub ingestion functions (repos, commits, manifests → dependencies)


## Demo Script
1. Visit `/jobs` and show preloaded postings
2. On `/candidates`, click "Connect GitHub" and authorize private access
3. Click "Evaluate Skills"; watch progress bar (~1–2 min)
4. Show resulting skills with reasoning
5. Click "Match Jobs"; present top-5 matches with explanations and open `job_url`
6. Navigate to a job detail `/jobs/[id]` to show top candidates view


## NDJSON Job Format
- File: `data/jobs.ndjson`
- One job per line as JSON object with keys:
```json
{
  "job_title": "AI/ML Engineer",
  "location": {"city": "Gurugram", "state": "Haryana", "country": "India"},
  "company": "Acme AI",
  "experience_level": "Mid-level / Intermediate",
  "years_of_experience": "~3yoe",
  "employment_type": "Full Time",
  "posted_date_relative": "4d ago",
  "tasks": ["Develop models", "Integrate AI"],
  "perks_benefits": [],
  "skills_tech_stack": ["AWS", "Docker", "PyTorch", "LLMs"],
  "educational_requirements": ["Bachelor's"],
  "job_url": "https://foorilla.com/hiring/jobs/...",
  "apply_url": "https://foorilla.com/hiring/jobs/.../apply"
}
```
- Loader maps nested `location` into the three columns and stores arrays as JSON strings.


## Matching Output Shape (API)
```json
{
  "top": [
    {
      "job_id": 123,
      "job_title": "AI/ML Engineer",
      "company": "Acme AI",
      "score": 0.82,
      "top_skills": [
        {"job_skill": "PyTorch", "candidate_skill": "PyTorch", "similarity": 0.92, "candidate_score": 0.88},
        {"job_skill": "LLMs", "candidate_skill": "Large Language Models", "similarity": 0.89, "candidate_score": 0.75}
      ],
      "job_url": "https://..."
    }
  ]
}
```


## Notes on Implementation Details
- Background job: On `POST /api/candidate/evaluate`, insert `evaluation_job` and fire-and-forget an async runner (Node process scope). Update `evaluation_job.progress` as repos complete.
- Aggregation pass runs after all repo analyses finish, writes `candidate_skill` and embeddings.
- Matching reads from `candidate_skill`, computes against `job_skill_embedding` in memory.
- All SQL is parameterized; keep helpers for repetitive CRUD.


## Acceptance Alignment
- Accurate skills from commit history + manifests using LLM per-repo
- Explainability via stored reasoning/evidence
- Matching driven by skills with recency/quantity weighting and embedding similarity
- Demo-ready with simple, clean UI and public employer pages 