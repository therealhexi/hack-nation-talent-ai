import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const candidate = db.prepare('SELECT id FROM candidate WHERE github_user_id = ?').get('local-demo-user-1') as { id: number } | undefined;
  if (!candidate) return NextResponse.json({ skills: [] });
  const rows = db
    .prepare('SELECT skill, score, reasoning FROM candidate_skill WHERE candidate_id = ? ORDER BY score DESC')
    .all(candidate.id) as { skill: string; score: number; reasoning: string }[];
  return NextResponse.json({ skills: rows });
} 