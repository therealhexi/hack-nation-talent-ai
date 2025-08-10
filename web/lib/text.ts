export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\+\#\.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeUnigramsBigrams(text: string): string[] {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(tokens[i] + '_' + tokens[i + 1]);
  }
  return [...tokens, ...bigrams];
}

export type SparseVector = Record<string, number>;

export function computeTf(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const total = tokens.length || 1;
  for (const k of Object.keys(tf)) tf[k] = tf[k] / total;
  return tf;
}

export function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  let dot = 0;
  let aNormSq = 0;
  let bNormSq = 0;
  for (const [k, av] of Object.entries(a)) {
    aNormSq += av * av;
    const bv = b[k];
    if (bv) dot += av * bv;
  }
  for (const bv of Object.values(b)) bNormSq += bv * bv;
  if (aNormSq === 0 || bNormSq === 0) return 0;
  return dot / (Math.sqrt(aNormSq) * Math.sqrt(bNormSq));
}

export function tfidfVector(tokens: string[], idf: Record<string, number>): SparseVector {
  const tf = computeTf(tokens);
  const vec: SparseVector = {};
  for (const [term, tfVal] of Object.entries(tf)) {
    const idfVal = idf[term];
    if (idfVal) vec[term] = tfVal * idfVal;
  }
  return vec;
}

export function toJson(vec: SparseVector): string {
  return JSON.stringify(vec);
}

export function fromJson(json: string | null | undefined): SparseVector {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object') return obj as SparseVector;
  } catch {}
  return {};
} 