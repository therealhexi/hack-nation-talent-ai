"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

  if (!job) return <section className="mx-auto max-w-4xl">Loading…</section>;

  return (
    <section className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">{job.job_title}</h1>
          <p className="text-[--color-muted-foreground]">{job.company}</p>
        </CardHeader>
        <CardContent>
          <div>
            <h2 className="font-medium">Skills</h2>
            <div className="mt-2 flex flex-wrap gap-1">
              {(JSON.parse(job.skills_tech_stack || '[]') as string[]).map((s, i) => (
                <Badge key={i} className="bg-[--color-primary]">{s}</Badge>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="font-medium">Top Candidates</h2>
            {candidates.length === 0 ? (
              <p className="text-sm text-[--color-muted-foreground]">No evaluated candidates yet.</p>
            ) : (
              candidates.map((c) => (
                <div key={c.job_id} className="mt-3 rounded-[var(--radius-sm)] border border-[--color-border] p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Demo User</div>
                    <div className="text-sm">Score: <span className="font-semibold">{c.score}</span></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.top_skills.slice(0, 5).map((s: any, i: number) => (
                      <Badge key={i} className="bg-green-100 text-green-800">{s.job_skill} ↔ {s.candidate_skill}</Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
} 