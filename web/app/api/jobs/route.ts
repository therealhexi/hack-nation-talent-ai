import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT id, job_title, company, location_city, location_state, location_country, skills_tech_stack FROM job_posting ORDER BY id DESC').all();
  return NextResponse.json(rows);
} 