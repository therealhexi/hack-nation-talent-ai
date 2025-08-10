"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type JobPosting = {
  id: number;
  job_title: string;
  company: string | null;
  skills_tech_stack: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  experience_level?: string | null;
  years_of_experience?: string | null;
  employment_type?: string | null;
  posted_date_relative?: string | null;
  tasks?: string | null;
  perks_benefits?: string | null;
  educational_requirements?: string | null;
  job_url?: string | null;
  apply_url?: string | null;
};

type MatchTopSkill = { job_skill: string; candidate_skill: string; similarity: number; candidate_score: number };

type MatchItem = { job_id: number; score: number; top_skills: MatchTopSkill[] };

async function fetchJob(id: string): Promise<JobPosting> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) throw new Error('Job not found');
  return res.json();
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id);
  const [job, setJob] = useState<JobPosting | null>(null);
  const [candidates, setCandidates] = useState<MatchItem[]>([]);

  useEffect(() => {
    if (!id) return;
    fetchJob(id).then(setJob).catch(() => setJob(null));
    fetch('/api/candidate/match', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        const filtered: MatchItem[] = (data.top || []).filter((r: MatchItem) => String(r.job_id) === String(id));
        setCandidates(filtered);
      });
  }, [id]);

  if (!job) return <section className="mx-auto max-w-4xl">Loading…</section>;

  return (
    <section className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">{job.job_title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-[--color-muted-foreground]">
            <p>{job.company}</p>
            <span>•</span>
            <p>
              {[job.location_city, job.location_state, job.location_country].filter(Boolean).join(', ') || 'Remote / Unspecified'}
            </p>
            {job.employment_type ? (<><span>•</span><p>{job.employment_type}</p></>) : null}
            {job.experience_level ? (<><span>•</span><p>{job.experience_level}</p></>) : null}
            {job.years_of_experience ? (<><span>•</span><p>{job.years_of_experience}</p></>) : null}
            {job.posted_date_relative ? (<><span>•</span><p>{job.posted_date_relative}</p></>) : null}
          </div>
          {job.apply_url ? (
            <div className="mt-3">
              <a href={job.apply_url} target="_blank" rel="noopener noreferrer">
                <Button>Apply</Button>
              </a>
            </div>
          ) : null}
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

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h2 className="font-medium">Key Tasks</h2>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {(JSON.parse(job.tasks || '[]') as string[]).slice(0, 10).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-medium">Perks & Benefits</h2>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {(JSON.parse(job.perks_benefits || '[]') as string[]).slice(0, 10).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-medium">Education</h2>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {(JSON.parse(job.educational_requirements || '[]') as string[]).slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
            {job.job_url ? (
              <div>
                <h2 className="font-medium">Job Posting</h2>
                <a className="mt-2 inline-block text-[--color-primary] underline" href={job.job_url} target="_blank" rel="noopener noreferrer">
                  View full job description
                </a>
              </div>
            ) : null}
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
                    {c.top_skills.slice(0, 5).map((s: MatchTopSkill, i: number) => (
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