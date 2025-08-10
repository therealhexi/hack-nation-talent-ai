import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="mx-auto max-w-4xl py-12">
      <div className="bg-subtle-gradient card-surface p-8">
        <h1 className="text-4xl font-semibold tracking-tight">Talent AI</h1>
        <p className="mt-2 text-[--color-muted-foreground]">Connect GitHub, evaluate skills, and match to jobs. Demo build.</p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/candidates"
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[--color-accent] px-4 py-2 text-white border border-[--color-border] shadow-sm hover:opacity-95"
          >
            <span className="underline underline-offset-4 decoration-white">Candidate</span>
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[--color-primary] px-4 py-2 text-[--color-foreground] border border-[--color-border] shadow-sm hover:opacity-95"
          >
            <span>Jobs</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
} 