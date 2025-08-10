"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

type Job = {
  id: number;
  job_title: string;
  company: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  skills_tech_stack: string;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');

  async function loadJobs() {
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/load-jobs', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      setMessage('Error: ' + json.error);
    } else {
      setMessage(`Loaded jobs: ${json.inserted}, vocabulary size: ${json.vocabulary_size}`);
      await refresh();
    }
    setLoading(false);
  }

  async function refresh() {
    const res = await fetch('/api/jobs');
    if (res.ok) setJobs(await res.json());
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Jobs</h1>
        <Button onClick={loadJobs} disabled={loading}>{loading ? 'Loading…' : 'Load demo jobs'}</Button>
      </div>
      {message && <p className="mt-2 text-sm text-[--color-muted-foreground]">{message}</p>}

      <Card className="mt-6">
        <CardHeader>
          <div className="text-sm text-[--color-muted-foreground]">{jobs.length} jobs</div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="p-2">Title</th>
                  <th className="p-2">Company</th>
                  <th className="p-2">Location</th>
                  <th className="p-2">Skills</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const skills: string[] = JSON.parse(j.skills_tech_stack || '[]');
                  return (
                    <tr key={j.id} className="border-b border-[--color-border] hover:bg-[--color-primary]">
                      <td className="p-2"><Link className="inline-flex font-medium items-center gap-1 text-[--color-accent] decoration-[--color-accent] hover:opacity-90" href={`/jobs/${j.id}`}>{j.job_title}<span aria-hidden>→</span></Link></td>
                      <td className="p-2">{j.company || '-'}</td>
                      <td className="p-2">{[j.location_city, j.location_state, j.location_country].filter(Boolean).join(', ')}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {skills.slice(0, 8).map((s, i) => (
                            <Badge key={i} className="bg-[--color-primary]">{s}</Badge>
                          ))}
                          {skills.length > 8 && <span className="text-xs text-[--color-muted-foreground]">+{skills.length - 8} more</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
} 