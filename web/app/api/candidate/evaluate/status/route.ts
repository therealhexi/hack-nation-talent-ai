import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = Number(searchParams.get('jobId'));
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare('SELECT status, progress, error FROM evaluation_job WHERE id = ?').get(jobId) as
    | { status: string; progress: number; error?: string }
    | undefined;
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
} 