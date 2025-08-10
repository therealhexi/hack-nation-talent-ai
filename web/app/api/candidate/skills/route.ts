import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const state = db.prepare('SELECT value FROM app_state WHERE key = ?').get('current_github_user_id') as { value: string } | undefined;
  const login = state?.value || null;
  if (!login) return NextResponse.json({ skills: [] });
  const candidate = db.prepare('SELECT id FROM candidate WHERE github_user_id = ?').get(login) as { id: number } | undefined;
  if (!candidate) return NextResponse.json({ skills: [] });
  const rows = db
    .prepare('SELECT skill, score, reasoning FROM candidate_skill WHERE candidate_id = ? ORDER BY score DESC')
    .all(candidate.id) as { skill: string; score: number; reasoning: string }[];
  return NextResponse.json({ skills: rows });
} 