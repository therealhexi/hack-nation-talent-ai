import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const db = getDb();
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const idStr = parts[parts.length - 1] || '';
  const id = Number(idStr);
  if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const row = db.prepare('SELECT * FROM job_posting WHERE id = ?').get(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
} 