import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { tokenizeUnigramsBigrams, tfidfVector, toJson } from '@/lib/text';
import { listUserPublicRepos, listRecentCommits, listFileTree, fetchDependenciesFromTree, buildExtensionHistogram } from '@/lib/github';
import { analyzeRepoSkills } from '@/lib/gemini';

export async function POST() {
  const db = getDb();
  const state = db.prepare('SELECT value FROM app_state WHERE key = ?').get('current_github_user_id') as { value: string } | undefined;
  const login = state?.value || null;
  if (!login) return NextResponse.json({ error: 'No connected GitHub user. Connect first.' }, { status: 400 });

  // Ensure candidate exists
  const selCand = db.prepare('SELECT id FROM candidate WHERE github_user_id = ?').get(login) as { id: number } | undefined;
  const candidateId = selCand?.id ?? Number(
    db.prepare(`INSERT INTO candidate (github_user_id, github_login, name, avatar_url, email, connected_at, evaluation_status)
      VALUES (?, ?, ?, ?, ?, ?, 'idle')`).run(login, login, login, null, null, Date.now()).lastInsertRowid
  );

  // Create job
  const jobInfo = db.prepare(`INSERT INTO evaluation_job (candidate_id, status, created_at, progress) VALUES (?, 'queued', ?, 0)`).run(candidateId, Date.now());
  const jobId = Number(jobInfo.lastInsertRowid);
  db.prepare(`UPDATE candidate SET evaluation_status = 'running' WHERE id = ?`).run(candidateId);

  // Fire & forget async runner within this request lifecycle (no await on completion)
  runEvaluationJob(jobId, candidateId, login).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    db.prepare('UPDATE evaluation_job SET status = ?, error = ?, completed_at = ? WHERE id = ?').run('error', msg, Date.now(), jobId);
    db.prepare('UPDATE candidate SET evaluation_status = ? WHERE id = ?').run('error', candidateId);
  });

  return NextResponse.json({ jobId });
}

async function runEvaluationJob(jobId: number, candidateId: number, githubLogin: string) {
  const db = getDb();
  function setJob(p: number, status: 'queued'|'running'|'success'|'error' = 'running') {
    db.prepare('UPDATE evaluation_job SET progress = ?, status = ?, started_at = COALESCE(started_at, ? ) WHERE id = ?')
      .run(p, status, Date.now(), jobId);
  }

  setJob(1, 'running');

  // Fetch public repos
  const repos = await listUserPublicRepos(githubLogin, 25);
  // Persist repos (replace existing for idempotency)
  db.transaction(() => {
    // First, clear derived data for existing repos to satisfy FK constraints
    const existingRepoIds = db.prepare('SELECT id FROM repo WHERE candidate_id = ?').all(candidateId) as { id: number }[];
    const ids = existingRepoIds.map((r) => r.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM commit_metadata WHERE repo_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM file_stat WHERE repo_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM dependency WHERE repo_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM repo_skill WHERE repo_id IN (${placeholders})`).run(...ids);
    }

    // Now replace repos
    db.prepare('DELETE FROM repo WHERE candidate_id = ?').run(candidateId);
    const ins = db.prepare(`INSERT INTO repo (candidate_id, repo_id, full_name, default_branch, private, stars, forks, language, pushed_at, is_fork)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`);
    for (const r of repos) {
      ins.run(candidateId, r.repoId, r.fullName, r.defaultBranch, r.isPrivate ? 1 : 0, r.stars, r.forks, r.language, r.pushedAtMs);
    }
  })();

  if (repos.length === 0) {
    // No repos: clear skills and finish gracefully
    db.transaction(() => {
      db.prepare('DELETE FROM candidate_skill WHERE candidate_id = ?').run(candidateId);
      db.prepare('UPDATE candidate SET last_evaluated_at = ?, evaluation_status = ? WHERE id = ?').run(Date.now(), 'success', candidateId);
      db.prepare('UPDATE evaluation_job SET status = ?, progress = ?, completed_at = ? WHERE id = ?').run('success', 100, Date.now(), jobId);
    })();
    return;
  }

  // For progress reporting
  const totalSteps = repos.length;
  let completed = 0;

  // Clear previous repo-level derived tables for idempotency
  db.transaction(() => {
    const repoIds = db.prepare('SELECT id FROM repo WHERE candidate_id = ?').all(candidateId) as { id: number }[];
    const ids = repoIds.map((r) => r.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM commit_metadata WHERE repo_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM file_stat WHERE repo_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM dependency WHERE repo_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM repo_skill WHERE repo_id IN (${placeholders})`).run(...ids);
    }
  })();

  // Map from full_name -> repo_row_id
  const repoRows = db.prepare('SELECT id, full_name, default_branch FROM repo WHERE candidate_id = ?').all(candidateId) as { id: number; full_name: string; default_branch: string }[];
  const fullNameToId = new Map<string, { id: number; branch: string }>();
  for (const r of repoRows) fullNameToId.set(r.full_name, { id: r.id, branch: r.default_branch });

  for (const repo of repos) {
    try {
      const repoRow = fullNameToId.get(repo.fullName);
      if (!repoRow) continue;

      // Fetch signals
      const [commits, files] = await Promise.all([
        listRecentCommits(repo.owner, repo.name, repo.defaultBranch, 100),
        listFileTree(repo.owner, repo.name, repo.defaultBranch, 2000),
      ]);
      const deps = await fetchDependenciesFromTree(repo.owner, repo.name, repo.defaultBranch, files);

      // Persist commit metadata (most recent 100)
      db.transaction(() => {
        const cIns = db.prepare('INSERT INTO commit_metadata (repo_id, sha, message, committed_at, author_name, author_login) VALUES (?, ?, ?, ?, ?, ?)');
        for (const c of commits) {
          cIns.run(repoRow.id, c.sha, c.message, c.committedAtMs, c.authorName, c.authorLogin);
        }
        const fIns = db.prepare('INSERT INTO file_stat (repo_id, path, extension, last_modified_at) VALUES (?, ?, ?, ?)');
        const now = Date.now();
        for (const f of files.slice(0, 2000)) {
          fIns.run(repoRow.id, f.path, f.extension, now);
        }
        const dIns = db.prepare('INSERT INTO dependency (repo_id, manager, name, version) VALUES (?, ?, ?, ?)');
        for (const d of deps) {
          dIns.run(repoRow.id, d.manager, d.name, d.version);
        }
      })();

      // Build signals for Gemini
      const hist = buildExtensionHistogram(files);
      const commitMessages = commits.slice(0, 30).map((c) => ({ message: c.message, committedAtMs: c.committedAtMs }));
      const skills = await analyzeRepoSkills({
        repo: { name: repo.fullName, language: repo.language, stars: repo.stars, forks: repo.forks, pushedAtMs: repo.pushedAtMs },
        dependencies: deps,
        commitMessages,
        fileExtensionHistogram: hist,
      });

      // Persist repo_skill
      if (skills.length > 0) {
        const rsIns = db.prepare('INSERT INTO repo_skill (repo_id, skill, score, reasoning, evidence) VALUES (?, ?, ?, ?, ?)');
        db.transaction(() => {
          for (const s of skills) rsIns.run(repoRow.id, s.skill, s.score, s.reasoning, JSON.stringify({ sources: s.evidence }));
        })();
      }
    } catch {
      // Continue with other repos
    }

    completed++;
    const pct = Math.max(5, Math.min(95, Math.round((completed / totalSteps) * 90) + 5));
    setJob(pct, 'running');
  }

  // Aggregate repo_skill -> candidate_skill
  try {
    // Load vocabulary idf
    const vocabRows = db.prepare('SELECT term, idf FROM vocabulary').all() as { term: string; idf: number }[];
    const idf: Record<string, number> = {};
    for (const r of vocabRows) idf[r.term] = r.idf;

    // Collect repo skills with recency and frequency weights
    const repoSkillRows = db.prepare(`
      SELECT rs.skill, rs.score AS repo_score, r.id as repo_row_id
      FROM repo_skill rs
      JOIN repo r ON rs.repo_id = r.id
      WHERE r.candidate_id = ?
    `).all(candidateId) as { skill: string; repo_score: number; repo_row_id: number }[];

    // Compute weights per repo: recency from commits, frequency from commit count
    const repoToWeight = new Map<number, number>();
    const repoIds = [...new Set(repoSkillRows.map((r) => r.repo_row_id))];
    for (const rid of repoIds) {
      const commits = db.prepare('SELECT committed_at FROM commit_metadata WHERE repo_id = ? ORDER BY committed_at DESC LIMIT 100').all(rid) as { committed_at: number }[];
      const commitsCount = commits.length;
      const mostRecent = commits[0]?.committed_at || 0;
      const ageDays = mostRecent ? (Date.now() - mostRecent) / (1000 * 60 * 60 * 24) : 365;
      const recencyWeight = Math.exp(-Math.log(2) * ageDays / 30);
      const freqWeight = Math.min(1, commitsCount / 100);
      repoToWeight.set(rid, recencyWeight * freqWeight);
    }

    // Aggregate
    const skillToScore: Record<string, number> = {};
    const skillToReason: Record<string, string[]> = {};
    for (const row of repoSkillRows) {
      const weight = repoToWeight.get(row.repo_row_id) ?? 0.2; // small default weight
      const contrib = row.repo_score * weight;
      skillToScore[row.skill] = Math.min(1, (skillToScore[row.skill] || 0) + contrib);
      // capture top 2 reasonings later by fetching
    }

    // Build reasoning by picking top 2 repo reasonings per skill
    const reasonRows = db.prepare(`
      SELECT rs.skill, rs.reasoning, r.id as repo_row_id
      FROM repo_skill rs JOIN repo r ON rs.repo_id = r.id
      WHERE r.candidate_id = ?
    `).all(candidateId) as { skill: string; reasoning: string }[];
    for (const rr of reasonRows) {
      const arr = skillToReason[rr.skill] || (skillToReason[rr.skill] = []);
      if (arr.length < 4) arr.push(rr.reasoning);
    }

    // Persist candidate_skill with embeddings
    const ins = db.prepare('INSERT INTO candidate_skill (candidate_id, skill, score, reasoning, embedding) VALUES (?, ?, ?, ?, ?)');
    db.transaction(() => {
      db.prepare('DELETE FROM candidate_skill WHERE candidate_id = ?').run(candidateId);
      for (const [skill, score] of Object.entries(skillToScore)) {
        const reasoning = (skillToReason[skill] || []).slice(0, 2).join(' ');
        const tokens = tokenizeUnigramsBigrams(skill);
        const vec = tfidfVector(tokens, idf);
        ins.run(candidateId, skill, Number(score.toFixed(4)), reasoning, toJson(vec));
      }
      db.prepare('UPDATE candidate SET last_evaluated_at = ?, evaluation_status = ? WHERE id = ?').run(Date.now(), 'success', candidateId);
    })();

    db.prepare('UPDATE evaluation_job SET status = ?, progress = ?, completed_at = ? WHERE id = ?').run('success', 100, Date.now(), jobId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.prepare('UPDATE evaluation_job SET status = ?, error = ?, completed_at = ? WHERE id = ?').run('error', msg, Date.now(), jobId);
    db.prepare('UPDATE candidate SET evaluation_status = ? WHERE id = ?').run('error', candidateId);
    throw e;
  }
} 