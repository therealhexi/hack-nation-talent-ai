'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

async function fetchJob(id: string) {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) throw new Error('Job not found');
  return res.json();
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id);
  const [job, setJob] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    fetchJob(id).then(setJob).catch(() => setJob(null));
    fetch('/api/candidate/match', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        const filtered = (data.top || []).filter((r: any) => String(r.job_id) === String(id));
        setCandidates(filtered);
      });
  }, [id]);

  if (!job) return <main className="mx-auto max-w-3xl p-6">Loading…</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{job.job_title}</h1>
      <p className="text-slate-600">{job.company}</p>
      <div className="mt-4">
        <h2 className="font-medium">Skills</h2>
        <div className="mt-2 flex flex-wrap gap-1">
          {(JSON.parse(job.skills_tech_stack || '[]') as string[]).map((s, i) => (
            <span key={i} className="rounded bg-slate-200 px-2 py-0.5 text-xs">{s}</span>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="font-medium">Top Candidates</h2>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-600">No evaluated candidates yet.</p>
        ) : (
          candidates.map((c) => (
            <div key={c.job_id} className="mt-3 rounded border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Demo User</div>
                <div className="text-sm">Score: <span className="font-semibold">{c.score}</span></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.top_skills.slice(0, 5).map((s: any, i: number) => (
                  <span key={i} className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">{s.job_skill} ↔ {s.candidate_skill}</span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
} 