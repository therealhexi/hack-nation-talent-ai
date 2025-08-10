import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { tokenizeUnigramsBigrams, tfidfVector, toJson } from '@/lib/text';

// In-memory runner state
const runningJobs = new Map<number, NodeJS.Timeout[]>();

function getOrCreateCandidateByGithubUserId(githubUserId: string, githubLogin: string): number {
  const db = getDb();
  const sel = db.prepare('SELECT id FROM candidate WHERE github_user_id = ?');
  const row = sel.get(githubUserId) as { id: number } | undefined;
  if (row) return row.id;
  const ins = db.prepare(`INSERT INTO candidate (github_user_id, github_login, name, avatar_url, email, connected_at, evaluation_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const info = ins.run(githubUserId, githubLogin, githubLogin, null, null, Date.now(), 'idle');
  return Number(info.lastInsertRowid);
}

export async function POST() {
  const db = getDb();
  const state = db.prepare('SELECT value FROM app_state WHERE key = ?').get('current_github_user_id') as { value: string } | undefined;
  const login = state?.value || null;
  if (!login) return NextResponse.json({ error: 'No connected GitHub user. Connect first.' }, { status: 400 });

  const candidateId = getOrCreateCandidateByGithubUserId(login, login);

  const jobIns = db.prepare(`INSERT INTO evaluation_job (candidate_id, status, created_at, progress) VALUES (?, 'queued', ?, 0)`);
  const jobInfo = jobIns.run(candidateId, Date.now());
  const jobId = Number(jobInfo.lastInsertRowid);

  // Update candidate status
  db.prepare(`UPDATE candidate SET evaluation_status = 'running' WHERE id = ?`).run(candidateId);

  // Simulate async progress with timeouts
  const timers: NodeJS.Timeout[] = [];
  function setProgress(p: number) {
    db.prepare('UPDATE evaluation_job SET progress = ?, status = ? WHERE id = ?').run(p, p < 100 ? 'running' : 'success', jobId);
  }

  function complete() {
    try {
      // Stub repo_skill aggregation to candidate_skill
      // We'll insert a few plausible skills with scores
      const candidateSkills = [
        { skill: 'TypeScript', score: 0.9, reasoning: 'Recent commits and package.json dependencies indicate heavy TypeScript usage.' },
        { skill: 'Next.js', score: 0.85, reasoning: 'Project structure and commit messages reference Next.js app router and Tailwind.' },
        { skill: 'Tailwind CSS', score: 0.7, reasoning: 'Significant commits touching Tailwind styles.' },
        { skill: 'SQLite', score: 0.6, reasoning: 'Dependencies and DB helpers suggest SQLite usage.' },
        { skill: 'OpenAIAgentsSDK', score: 0.8, reasoning: 'Recent commits reference OpenAIAgentsSDK.' },
        { skill: 'AI', score: 0.6, reasoning: 'Recent commits reference OpenAIAgentsSDK.' },
      ];

      // Load vocabulary
      const vocabRows = db.prepare('SELECT term, idf FROM vocabulary').all() as { term: string; idf: number }[];
      const idf: Record<string, number> = {};
      for (const r of vocabRows) idf[r.term] = r.idf;

      const ins = db.prepare('INSERT INTO candidate_skill (candidate_id, skill, score, reasoning, embedding) VALUES (?, ?, ?, ?, ?)');

      db.transaction(() => {
        // Clear existing candidate skills first for idempotency
        db.prepare('DELETE FROM candidate_skill WHERE candidate_id = ?').run(candidateId);
        for (const cs of candidateSkills) {
          const tokens = tokenizeUnigramsBigrams(cs.skill);
          const vec = tfidfVector(tokens, idf);
          ins.run(candidateId, cs.skill, cs.score, cs.reasoning, toJson(vec));
        }
        db.prepare('UPDATE candidate SET last_evaluated_at = ?, evaluation_status = ? WHERE id = ?').run(Date.now(), 'success', candidateId);
      })();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'error';
      db.prepare('UPDATE evaluation_job SET status = \'error\', error = ? WHERE id = ?').run(message, jobId);
      db.prepare('UPDATE candidate SET evaluation_status = \'error\' WHERE id = ?').run(candidateId);
      return;
    }
    setProgress(100);
  }

  timers.push(setTimeout(() => setProgress(10), 300));
  timers.push(setTimeout(() => setProgress(35), 900));
  timers.push(setTimeout(() => setProgress(65), 1600));
  timers.push(setTimeout(() => setProgress(90), 2300));
  timers.push(setTimeout(() => complete(), 2800));

  runningJobs.set(jobId, timers);

  return NextResponse.json({ jobId });
} 