'use client';

import { useEffect, useState } from 'react';

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
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <button className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50" onClick={loadJobs} disabled={loading}>
          {loading ? 'Loading…' : 'Load demo jobs'}
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b">
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
                <tr key={j.id} className="border-b hover:bg-slate-50">
                  <td className="p-2"><a className="text-blue-600 hover:underline" href={`/jobs/${j.id}`}>{j.job_title}</a></td>
                  <td className="p-2">{j.company || '-'}</td>
                  <td className="p-2">{[j.location_city, j.location_state, j.location_country].filter(Boolean).join(', ')}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {skills.slice(0, 8).map((s, i) => (
                        <span key={i} className="rounded bg-slate-200 px-2 py-0.5 text-xs">{s}</span>
                      ))}
                      {skills.length > 8 && <span className="text-xs text-slate-500">+{skills.length - 8} more</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
} 