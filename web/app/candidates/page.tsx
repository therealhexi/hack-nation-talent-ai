"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Skill = { skill: string; score: number; reasoning: string };

type EvalStatus = { status: string; progress: number; error?: string };

type MatchTopSkill = { job_skill: string; candidate_skill: string };
type MatchItem = { job_id: number; job_title: string; company: string; score: number; top_skills: MatchTopSkill[] };

export default function CandidatesPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<EvalStatus | null>(null);
  const [matches, setMatches] = useState<MatchItem[]>([]);

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
    setMatches((json.top || []) as MatchItem[]);
  }

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Candidate Dashboard</h1>
          <p className="mt-1 text-[--color-muted-foreground]">Stubbed auth: acting as Demo User.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={startEvaluation} disabled={status?.status === "running"}>
            {status?.status === "running" ? "Evaluating…" : "Evaluate Skills"}
          </Button>
          <Button variant="secondary" onClick={runMatch}>Match Jobs</Button>
        </div>
      </div>

      {status && (
        <div className="mt-4">
          <Progress value={status.progress || 0} />
          <div className="mt-2 text-sm text-[--color-muted-foreground]">
            Status: {status.status}{status.error ? ` – ${status.error}` : ""}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium">Skills</h2>
          </CardHeader>
          <CardContent>
            {skills.length === 0 ? (
              <p className="text-sm text-[--color-muted-foreground]">No skills yet. Click Evaluate Skills.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[--color-border]">
                    <th className="p-2">Skill</th>
                    <th className="p-2">Score</th>
                    <th className="p-2">Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s) => (
                    <tr key={s.skill} className="border-b border-[--color-border]">
                      <td className="p-2"><Badge className="bg-[--color-primary]">{s.skill}</Badge></td>
                      <td className="p-2">{s.score}</td>
                      <td className="p-2 text-[--color-muted-foreground]">{s.reasoning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium">Matches</h2>
          </CardHeader>
          <CardContent>
            {matches.length === 0 ? (
              <p className="text-sm text-[--color-muted-foreground]">No matches. Click Match Jobs after evaluation.</p>
            ) : (
              <div className="grid gap-3">
                {matches.map((m) => (
                  <div key={m.job_id} className="rounded-[var(--radius-sm)] border border-[--color-border] p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link href={`/jobs/${m.job_id}`} className="inline-flex items-center gap-1 text-[--color-accent] underline underline-offset-4 decoration-[--color-accent] hover:opacity-90">{m.job_title}<span aria-hidden>→</span></Link>
                        <div className="text-sm text-[--color-muted-foreground]">{m.company}</div>
                      </div>
                      <div className="text-sm">Score: <span className="font-semibold">{m.score}</span></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.top_skills.slice(0, 6).map((s: MatchTopSkill, i: number) => (
                        <Badge key={i} className="bg-green-100 text-green-800">{s.job_skill} ↔ {s.candidate_skill}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
} 