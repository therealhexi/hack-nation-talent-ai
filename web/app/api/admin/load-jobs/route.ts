import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { tokenizeUnigramsBigrams, tfidfVector, toJson } from '@/lib/text';

export async function POST() {
  try {
    const db = getDb();

    const dataPath = path.join(process.cwd(), '..', 'data', 'jobs.ndjson');
    let lines: string[] = [];
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    }

    const insertJob = db.prepare(`
      INSERT INTO job_posting (
        job_title, company,
        location_city, location_state, location_country,
        experience_level, years_of_experience, employment_type,
        posted_date_relative, tasks, perks_benefits, skills_tech_stack,
        educational_requirements, job_url, apply_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const clearVocab = db.prepare('DELETE FROM vocabulary');
    const clearEmb = db.prepare('DELETE FROM job_skill_embedding');
    const clearJobs = db.prepare('DELETE FROM job_posting');

    const jobIds: number[] = [];
    const allSkillTexts: string[] = [];

    db.transaction(() => {
      clearEmb.run();
      clearVocab.run();
      clearJobs.run();

      for (const line of lines) {
        let obj: any;
        try {
          obj = JSON.parse(line) as any;
        } catch {
          continue; // skip non-JSON lines
        }
        if (!obj || typeof obj !== 'object' || !obj.job_title) continue;
        const loc = obj.location || {};
        const tasks = JSON.stringify(obj.tasks || []);
        const perks = JSON.stringify(obj.perks_benefits || []);
        const skillsArr: string[] = Array.isArray(obj.skills_tech_stack) ? obj.skills_tech_stack : [];
        const skills = JSON.stringify(skillsArr);
        const edu = JSON.stringify(obj.educational_requirements || []);
        const info = insertJob.run(
          String(obj.job_title),
          obj.company ? String(obj.company) : null,
          loc.city ? String(loc.city) : null,
          loc.state ? String(loc.state) : null,
          loc.country ? String(loc.country) : null,
          obj.experience_level ? String(obj.experience_level) : null,
          obj.years_of_experience ? String(obj.years_of_experience) : null,
          obj.employment_type ? String(obj.employment_type) : null,
          obj.posted_date_relative ? String(obj.posted_date_relative) : null,
          tasks,
          perks,
          skills,
          edu,
          obj.job_url ? String(obj.job_url) : null,
          obj.apply_url ? String(obj.apply_url) : null,
        );
        const jobId = Number(info.lastInsertRowid);
        jobIds.push(jobId);
        for (const s of skillsArr) allSkillTexts.push(String(s));
      }

      if (jobIds.length === 0) {
        // Seed a small demo set
        const demo: any[] = [
          {
            job_title: 'AI/ML Engineer',
            company: 'Acme AI',
            location: { city: 'Gurugram', state: 'Haryana', country: 'India' },
            experience_level: 'Mid-level / Intermediate',
            years_of_experience: '~3yoe',
            employment_type: 'Full Time',
            posted_date_relative: '4d ago',
            tasks: ['Develop models', 'Integrate AI'],
            perks_benefits: [],
            skills_tech_stack: ['AWS', 'Docker', 'PyTorch', 'LLMs', 'TypeScript', 'Next.js', 'Tailwind CSS', 'SQLite'],
            educational_requirements: ["Bachelor's"],
            job_url: 'https://example.com/job/1',
            apply_url: 'https://example.com/job/1/apply',
          },
          {
            job_title: 'Frontend Engineer',
            company: 'Webify',
            location: { city: 'San Francisco', state: 'CA', country: 'USA' },
            experience_level: 'Senior',
            years_of_experience: '5+ years',
            employment_type: 'Full Time',
            posted_date_relative: '1w ago',
            tasks: ['Build UI', 'Own frontend architecture'],
            perks_benefits: [],
            skills_tech_stack: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
            educational_requirements: [],
            job_url: 'https://example.com/job/2',
            apply_url: 'https://example.com/job/2/apply',
          },
        ];
        for (const obj of demo) {
          const loc = obj.location || {};
          const tasks = JSON.stringify(obj.tasks || []);
          const perks = JSON.stringify(obj.perks_benefits || []);
          const skillsArr: string[] = obj.skills_tech_stack || [];
          const skills = JSON.stringify(skillsArr);
          const edu = JSON.stringify(obj.educational_requirements || []);
          const info = insertJob.run(
            obj.job_title,
            obj.company,
            loc.city || null,
            loc.state || null,
            loc.country || null,
            obj.experience_level || null,
            obj.years_of_experience || null,
            obj.employment_type || null,
            obj.posted_date_relative || null,
            tasks,
            perks,
            skills,
            edu,
            obj.job_url || null,
            obj.apply_url || null,
          );
          const jobId = Number(info.lastInsertRowid);
          jobIds.push(jobId);
          for (const s of skillsArr) allSkillTexts.push(String(s));
        }
      }
    })();

    // Build vocabulary from all job skills
    const termToDf = new Map<string, number>();
    for (const s of allSkillTexts) {
      const tokens = tokenizeUnigramsBigrams(s);
      const unique = Array.from(new Set(tokens));
      for (const t of unique) termToDf.set(t, (termToDf.get(t) || 0) + 1);
    }

    const N = allSkillTexts.length || 1;
    const upsertVocab = db.prepare('INSERT OR REPLACE INTO vocabulary (term, df, idf) VALUES (?, ?, ?)');
    const idfMap: Record<string, number> = {};
    db.transaction(() => {
      for (const [term, df] of termToDf.entries()) {
        const idf = Math.log((N + 1) / (df + 1)) + 1; // smoothed idf
        idfMap[term] = idf;
        upsertVocab.run(term, df, idf);
      }
    })();

    // Compute job skill embeddings
    const getJobs = db.prepare('SELECT id, skills_tech_stack FROM job_posting');
    const rows = getJobs.all() as { id: number; skills_tech_stack: string }[];
    const insertEmb = db.prepare('INSERT INTO job_skill_embedding (job_id, skill, embedding) VALUES (?, ?, ?)');

    db.transaction(() => {
      for (const row of rows) {
        const skills: string[] = JSON.parse(row.skills_tech_stack || '[]');
        for (const s of skills) {
          const tokens = tokenizeUnigramsBigrams(String(s));
          const vec = tfidfVector(tokens, idfMap);
          insertEmb.run(row.id, String(s), toJson(vec));
        }
      }
    })();

    return NextResponse.json({ inserted: jobIds.length, vocabulary_size: Object.keys(idfMap).length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'unknown error' }, { status: 500 });
  }
} 