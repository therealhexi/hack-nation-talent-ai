export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Talent AI</h1>
      <p className="mt-2 text-slate-600">Connect GitHub, evaluate skills, and match to jobs. Demo build.</p>
      <div className="mt-6 flex gap-3">
        <a href="/candidates" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Candidate</a>
        <a href="/jobs" className="rounded bg-slate-200 px-4 py-2 hover:bg-slate-300">Jobs</a>
      </div>
    </main>
  );
} 