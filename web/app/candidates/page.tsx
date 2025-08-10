"use client";

import { useEffect, useState } from "react";

type Skill = { skill: string; score: number; reasoning: string };

type EvalStatus = { status: string; progress: number; error?: string };

export default function CandidatesPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<EvalStatus | null>(null);
  const [matches, setMatches] = useState<any[]>([]);

  async function loadSkills() {
    const res = await fetch("/api/candidate/skills");
    const json = await res.json();
    setSkills(json.skills || []);
  }

  async function startEvaluation() {
    setStatus({ status: "queued", progress: 0 });
    setMatches([]);
    const res = await fetch("/api/candidate/evaluate", { method: "POST" });
    const json = await res.json();
    setJobId(json.jobId);
  }

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let mounted = true;
    const id = setInterval(async () => {
      const res = await fetch(`/api/candidate/evaluate/status?jobId=${jobId}`);
      const json = await res.json();
      if (!mounted) return;
      setStatus(json);
      if (json.status === "success") {
        clearInterval(id);
        loadSkills();
      }
    }, 600);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [jobId]);

  async function runMatch() {
    const res = await fetch("/api/candidate/match", { method: "POST" });
    const json = await res.json();
    setMatches(json.top || []);
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Candidate Dashboard</h1>
      <p className="mt-1 text-slate-600">Stubbed auth: acting as Demo User.</p>

      <div className="mt-4 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50" onClick={startEvaluation} disabled={status?.status === "running"}>
          {status?.status === "running" ? "Evaluating…" : "Evaluate Skills"}
        </button>
        <button className="rounded bg-green-600 px-3 py-2 text-white disabled:opacity-50" onClick={runMatch}>
          Match Jobs
        </button>
      </div>

      {status && (
        <div className="mt-3">
          <div className="h-2 w-full rounded bg-slate-200">
            <div className="h-2 rounded bg-blue-600" style={{ width: `${status.progress || 0}%` }} />
          </div>
          <div className="mt-1 text-sm text-slate-600">Status: {status.status}{status.error ? ` – ${status.error}` : ""}</div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-lg font-medium">Skills</h2>
        {skills.length === 0 ? (
          <p className="text-sm text-slate-600">No skills yet. Click Evaluate Skills.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Skill</th>
                <th className="p-2">Score</th>
                <th className="p-2">Reasoning</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.skill} className="border-b">
                  <td className="p-2">{s.skill}</td>
                  <td className="p-2">{s.score}</td>
                  <td className="p-2 text-slate-600">{s.reasoning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium">Matches</h2>
        {matches.length === 0 ? (
          <p className="text-sm text-slate-600">No matches. Click Match Jobs after evaluation.</p>
        ) : (
          <div className="mt-2 grid gap-3">
            {matches.map((m: any) => (
              <div key={m.job_id} className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <a href={`/jobs/${m.job_id}`} className="font-medium text-blue-600 hover:underline">{m.job_title}</a>
                    <div className="text-sm text-slate-600">{m.company}</div>
                  </div>
                  <div className="text-sm">Score: <span className="font-semibold">{m.score}</span></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.top_skills.slice(0, 6).map((s: any, i: number) => (
                    <span key={i} className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">{s.job_skill} ↔ {s.candidate_skill}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
} 