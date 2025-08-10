import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function extractLoginFromUrlOrLogin(input: string): string | null {
  try {
    // Normalize and allow optional leading '@'
    const raw = String(input || '').trim();
    const cleaned = raw.startsWith('@') ? raw.slice(1) : raw;

    // If it's a URL, parse pathname
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      const u = new URL(cleaned);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[0] || null;
    }
    // Otherwise assume it's a username
    if (/^[A-Za-z0-9-]+$/.test(input)) return input;
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  const db = getDb();
  const state = db.prepare('SELECT value FROM app_state WHERE key = ?').get('current_github_user_id') as { value: string } | undefined;
  return NextResponse.json({ login: state?.value || null });
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const raw: string | undefined = body?.github || body?.url || body?.login;
  if (!raw) return NextResponse.json({ error: 'github url or username is required' }, { status: 400 });

  const login = extractLoginFromUrlOrLogin(String(raw));
  if (!login) return NextResponse.json({ error: 'invalid github url or username' }, { status: 400 });

  // Store current user in app_state
  db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run('current_github_user_id', login);

  // Ensure candidate record exists
  const sel = db.prepare('SELECT id FROM candidate WHERE github_user_id = ?');
  const row = sel.get(login) as { id: number } | undefined;
  if (!row) {
    const ins = db.prepare(`INSERT INTO candidate (github_user_id, github_login, name, avatar_url, email, connected_at, evaluation_status)
      VALUES (?, ?, ?, ?, ?, ?, 'idle')`);
    ins.run(login, login, login, null, null, Date.now());
  }

  return NextResponse.json({ ok: true, login });
} 