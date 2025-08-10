import { GoogleGenerativeAI } from '@google/generative-ai';

export type RepoSignals = {
  repo: {
    name: string;
    language: string | null;
    stars: number;
    forks: number;
    pushedAtMs: number;
  };
  dependencies: { manager: string; name: string; version: string | null }[];
  commitMessages: { message: string; committedAtMs: number }[];
  fileExtensionHistogram: Record<string, number>;
};

export type RepoSkill = {
  skill: string;
  score: number;
  reasoning: string;
  evidence: string[];
};

function systemInstruction(): string {
  return 'You derive technical skills from a repository using indirect evidence (dependencies, commit messages, file types). Output concise, accurate skills without guessing.';
}

function buildUserPrompt(signals: RepoSignals): string {
  const depList = signals.dependencies.slice(0, 40).map((d) => `${d.manager}:${d.name}${d.version ? '@' + d.version : ''}`).join(', ');
  const commits = signals.commitMessages.slice(0, 30).map((c) => `- ${new Date(c.committedAtMs).toISOString()}: ${c.message.replace(/\s+/g, ' ').slice(0, 180)}`).join('\n');
  const fileHist = Object.entries(signals.fileExtensionHistogram)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ext, n]) => `${ext}:${n}`).join(', ');

  return `Repository summary:\n` +
    `- name: ${signals.repo.name}\n` +
    `- language: ${signals.repo.language || 'unknown'}\n` +
    `- stars: ${signals.repo.stars}, forks: ${signals.repo.forks}\n` +
    `- last_pushed: ${new Date(signals.repo.pushedAtMs).toISOString()}\n\n` +
    `Dependencies (top): ${depList || 'none'}\n\n` +
    `Recent commit messages (up to 30):\n${commits || '(none)'}\n\n` +
    `File extensions histogram (top): ${fileHist || 'none'}\n\n` +
    `Task: Determine a small set of technical skills practiced in this repo with a relevance score (0..1), and a short reasoning (1-2 sentences). Score more generously. \n` +
    `Output strict JSON: {"skills": [{"skill":"...","score":0.8,"reasoning":"...","evidence":["sources..."]}]}`;
}

export async function analyzeRepoSkills(signals: RepoSignals): Promise<RepoSkill[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('[gemini] GOOGLE_API_KEY is missing');
  }
  if (!apiKey) throw new Error('GOOGLE_API_KEY is required');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: systemInstruction() });

  console.log('[gemini] analyzeRepoSkills start', {
    repo: signals.repo.name,
    language: signals.repo.language,
    stars: signals.repo.stars,
    forks: signals.repo.forks,
    deps: signals.dependencies.length,
    commits: signals.commitMessages.length,
    fileExts: Object.keys(signals.fileExtensionHistogram).length,
  });

  const prompt = buildUserPrompt(signals);
  console.log('[gemini] prompt preview', { repo: signals.repo.name, length: prompt.length, preview: prompt.slice(0, 300) });
  const resp = await model.generateContent(prompt);
  const text = resp.response.text();
  console.log('[gemini] raw response length', { repo: signals.repo.name, length: text.length, preview: text.slice(0, 200) });
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.skills)) {
      console.log('[gemini] parsed skills', { repo: signals.repo.name, count: parsed.skills.length });
      return parsed.skills.map((s: unknown) => {
        const obj = s as { skill?: unknown; score?: unknown; reasoning?: unknown; evidence?: unknown };
        return {
          skill: String(obj.skill ?? '').slice(0, 120),
          score: Math.max(0, Math.min(1, Number(obj.score) || 0)),
          reasoning: String(obj.reasoning ?? '').slice(0, 500),
          evidence: Array.isArray(obj.evidence) ? (obj.evidence as unknown[]).slice(0, 6).map(String) : [],
        } as RepoSkill;
      });
    }
  } catch (_e) {
    // attempt to recover from non-JSON with code fences
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (parsed && Array.isArray(parsed.skills)) {
          console.log('[gemini] parsed skills via fallback JSON extraction', { repo: signals.repo.name, count: parsed.skills.length });
          return parsed.skills.map((s: unknown) => {
            const obj = s as { skill?: unknown; score?: unknown; reasoning?: unknown; evidence?: unknown };
            return {
              skill: String(obj.skill ?? '').slice(0, 120),
              score: Math.max(0, Math.min(1, Number(obj.score) || 0)),
              reasoning: String(obj.reasoning ?? '').slice(0, 500),
              evidence: Array.isArray(obj.evidence) ? (obj.evidence as unknown[]).slice(0, 6).map(String) : [],
            } as RepoSkill;
          });
        }
      } catch {}
    }
  }
  // If parsing failed, return empty skills to keep pipeline resilient
  console.warn('[gemini] no skills parsed', { repo: signals.repo.name });
  return [];
} 