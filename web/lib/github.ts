const GITHUB_API = 'https://api.github.com';

type GhRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  fork: boolean;
  stargazers_count?: number;
  forks_count?: number;
  language?: string | null;
  pushed_at?: string | null;
};

type GhCommit = {
  sha: string;
  commit?: { message?: string; committer?: { date?: string }; author?: { date?: string; name?: string } };
  author?: { login?: string } | null;
};

type GhBranch = { commit?: { sha?: string } };

type GhTree = { tree?: { type?: string; path?: string }[] };

type GhContent = { content?: string };

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'talent-ai-local-demo'
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders(), ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

export type PublicRepoSummary = {
  repoId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  stars: number;
  forks: number;
  language: string | null;
  pushedAtMs: number;
};

export async function listUserPublicRepos(login: string, limit = 25): Promise<PublicRepoSummary[]> {
  const perPage = Math.min(100, limit);
  console.log('[github] listUserPublicRepos', { login, limit });
  const repos = await gh<GhRepo[]>(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=${perPage}`);
  const filtered = repos
    .filter((r) => !r.fork)
    .slice(0, limit)
    .map((r) => ({
      repoId: String(r.id),
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      isPrivate: !!r.private,
      isFork: !!r.fork,
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      language: r.language || null,
      pushedAtMs: r.pushed_at ? Date.parse(r.pushed_at) : 0,
    })) as PublicRepoSummary[];
  console.log('[github] repos fetched', { total: repos.length, filtered: filtered.length, names: filtered.map((r) => r.fullName).slice(0, 10) });
  return filtered;
}

export type CommitMeta = {
  sha: string;
  message: string;
  committedAtMs: number;
  authorName: string | null;
  authorLogin: string | null;
};

export async function listRecentCommits(owner: string, repo: string, branch: string, limit = 100): Promise<CommitMeta[]> {
  const perPage = Math.min(100, limit);
  const commits = await gh<GhCommit[]>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`);
  console.log('[github] listRecentCommits', { owner, repo, branch, count: commits.length });
  return commits.map((c) => ({
    sha: c.sha,
    message: c.commit?.message || '',
    committedAtMs: c.commit?.committer?.date ? Date.parse(c.commit.committer.date) : (c.commit?.author?.date ? Date.parse(c.commit.author.date) : 0),
    authorName: c.commit?.author?.name || c.author?.login || null,
    authorLogin: c.author?.login || null,
  })) as CommitMeta[];
}

async function getBranchHeadSha(owner: string, repo: string, branch: string): Promise<string> {
  const b = await gh<GhBranch>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`);
  return (b.commit && b.commit.sha) ? b.commit.sha : '';
}

export type FileStat = {
  path: string;
  extension: string | null;
};

export async function listFileTree(owner: string, repo: string, branch: string, maxEntries = 2000): Promise<FileStat[]> {
  const headSha = await getBranchHeadSha(owner, repo, branch);
  const tree = await gh<GhTree>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(headSha)}?recursive=1`);
  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  const files = entries
    .filter((e) => e.type === 'blob' && typeof e.path === 'string')
    .slice(0, maxEntries)
    .map((e) => {
      const p: string = e.path || '';
      const dot = p.lastIndexOf('.');
      const ext = dot > -1 && dot < p.length - 1 ? p.slice(dot + 1).toLowerCase() : null;
      return { path: p, extension: ext } as FileStat;
    });
  console.log('[github] listFileTree', { owner, repo, branch, headSha: headSha ? headSha.slice(0, 7) : '', files: files.length });
  return files;
}

async function fetchContentBase64(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const data = await gh<GhContent>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
    if (data && data.content && typeof data.content === 'string') {
      const buff = Buffer.from(data.content, 'base64');
      return buff.toString('utf8');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[github] fetchContentBase64 failed', { owner, repo, path, ref, message });
    return null;
  }
  return null;
}

export type DependencyRecord = { manager: string; name: string; version: string | null };

function parsePackageJson(content: string): DependencyRecord[] {
  try {
    const obj = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = obj?.dependencies || {};
    const dev = obj?.devDependencies || {};
    const all: DependencyRecord[] = [];
    for (const [name, version] of Object.entries(deps)) all.push({ manager: 'npm', name, version: String(version) });
    for (const [name, version] of Object.entries(dev)) all.push({ manager: 'npm', name, version: String(version) });
    return all;
  } catch {
    return [];
  }
}

function parseRequirementsTxt(content: string): DependencyRecord[] {
  const result: DependencyRecord[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z0-9_.\-]+)(?:\[.*\])?\s*([<>=!~]+)?\s*(.+)?$/);
    if (m) {
      const name = m[1];
      const version = m[3] ? m[2] + m[3] : null;
      result.push({ manager: 'pip', name, version });
    }
  }
  return result;
}

function parseGoMod(content: string): DependencyRecord[] {
  const deps: DependencyRecord[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_.\-\/]+)\s+v[0-9][^\s]+/);
    if (m) deps.push({ manager: 'go', name: m[1], version: null });
  }
  return deps;
}

export async function fetchDependencies(owner: string, repo: string, branch: string): Promise<DependencyRecord[]> {
  const results: DependencyRecord[] = [];
  const pkg = await fetchContentBase64(owner, repo, 'package.json', branch);
  if (pkg) results.push(...parsePackageJson(pkg));
  const req = await fetchContentBase64(owner, repo, 'requirements.txt', branch);
  if (req) results.push(...parseRequirementsTxt(req));
  const gomod = await fetchContentBase64(owner, repo, 'go.mod', branch);
  if (gomod) results.push(...parseGoMod(gomod));
  console.log('[github] fetchDependencies', { owner, repo, branch, hasPackageJson: !!pkg, hasRequirementsTxt: !!req, hasGoMod: !!gomod, totalDeps: results.length });
  return results;
}

function depthOfPath(p: string): number {
  return p.split('/').filter(Boolean).length;
}

function pickTopCandidate(paths: string[], filename: string): string | null {
  const filtered = paths
    .filter((p) => p.toLowerCase().endsWith(`/${filename}`) || p.toLowerCase() === filename)
    .filter((p) => !p.includes('node_modules/') && !p.startsWith('node_modules/') && !p.startsWith('.git/') && !p.includes('/.git/'));
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => depthOfPath(a) - depthOfPath(b) || a.length - b.length);
  return filtered[0];
}

export async function fetchDependenciesFromTree(
  owner: string,
  repo: string,
  branch: string,
  files: FileStat[],
): Promise<DependencyRecord[]> {
  const paths = files.map((f) => f.path);
  const packageJsonPath = pickTopCandidate(paths, 'package.json');
  const requirementsTxtPath = pickTopCandidate(paths, 'requirements.txt');
  const goModPath = pickTopCandidate(paths, 'go.mod');

  const results: DependencyRecord[] = [];
  const pkg = packageJsonPath ? await fetchContentBase64(owner, repo, packageJsonPath, branch) : null;
  if (pkg) results.push(...parsePackageJson(pkg));
  const req = requirementsTxtPath ? await fetchContentBase64(owner, repo, requirementsTxtPath, branch) : null;
  if (req) results.push(...parseRequirementsTxt(req));
  const gomod = goModPath ? await fetchContentBase64(owner, repo, goModPath, branch) : null;
  if (gomod) results.push(...parseGoMod(gomod));

  console.log('[github] fetchDependenciesFromTree', {
    owner,
    repo,
    branch,
    packageJsonPath: packageJsonPath || null,
    requirementsTxtPath: requirementsTxtPath || null,
    goModPath: goModPath || null,
    totalDeps: results.length,
  });
  return results;
}

export function buildExtensionHistogram(files: FileStat[]): Record<string, number> {
  const hist: Record<string, number> = {};
  for (const f of files) {
    const ext = f.extension || 'none';
    hist[ext] = (hist[ext] || 0) + 1;
  }
  return hist;
} 