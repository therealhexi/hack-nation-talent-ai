import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { fromJson, cosineSimilarity } from '@/lib/text';

export async function POST() {
  const db = getDb();

  const state = db.prepare('SELECT value FROM app_state WHERE key = ?').get('current_github_user_id') as { value: string } | undefined;
  const login = state?.value || null;
  if (!login) return NextResponse.json({ top: [] });

  const candRow = db.prepare('SELECT id FROM candidate WHERE github_user_id = ?').get(login) as { id: number } | undefined;
  if (!candRow) return NextResponse.json({ top: [] });
  const candidateId = candRow.id;

  const candSkills = db
    .prepare('SELECT skill, score, embedding FROM candidate_skill WHERE candidate_id = ?')
    .all(candidateId) as { skill: string; score: number; embedding: string }[];
  const candVecs = candSkills.map((s) => ({ skill: s.skill, score: s.score, vec: fromJson(s.embedding) }));

  const jobs = db.prepare('SELECT id, job_title, company, job_url FROM job_posting').all() as { id: number; job_title: string; company: string; job_url: string }[];
  const embRows = db
    .prepare('SELECT job_id, skill, embedding FROM job_skill_embedding')
    .all() as { job_id: number; skill: string; embedding: string }[];

  const jobIdToEmb: Record<number, { skill: string; vec: Record<string, number> }[]> = {};
  for (const r of embRows) {
    const arr = jobIdToEmb[r.job_id] || (jobIdToEmb[r.job_id] = []);
    arr.push({ skill: r.skill, vec: fromJson(r.embedding) });
  }

  const results = [] as {
    job_id: number;
    job_title: string;
    company: string;
    job_url: string | null;
    score: number;
    top_skills: { job_skill: string; candidate_skill: string; similarity: number; candidate_score: number }[];
  }[];

  for (const job of jobs) {
    const embeddings = jobIdToEmb[job.id] || [];
    if (embeddings.length === 0) continue;
    const contributions: number[] = [];
    const explanations: { job_skill: string; candidate_skill: string; similarity: number; candidate_score: number }[] = [];
    for (const je of embeddings) {
      let bestSim = 0;
      let bestIdx = -1;
      for (let i = 0; i < candVecs.length; i++) {
        const sim = cosineSimilarity(je.vec, candVecs[i].vec);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const chosen = candVecs[bestIdx];
        const weighted = bestSim * chosen.score;
        contributions.push(weighted);
        explanations.push({ job_skill: je.skill, candidate_skill: chosen.skill, similarity: Number(bestSim.toFixed(4)), candidate_score: chosen.score });
      }
    }
    if (contributions.length === 0) continue;
    const avg = contributions.reduce((a, b) => a + b, 0) / contributions.length;
    explanations.sort((a, b) => b.similarity * b.candidate_score - a.similarity * a.candidate_score);
    results.push({ job_id: job.id, job_title: job.job_title, company: job.company, job_url: job.job_url, score: Number(avg.toFixed(4)), top_skills: explanations.slice(0, 8) });
  }

  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({ top: results.slice(0, 5) });
} 