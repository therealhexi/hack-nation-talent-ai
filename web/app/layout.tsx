import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Talent AI',
  description: 'Evaluate skills and match candidates to jobs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[--background] text-[--foreground]`}>
        <header className="border-b border-[--color-border] bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">Talent AI</Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link className="rounded px-3 py-1.5 hover:bg-[--primary]" href="/">Home</Link>
              <Link className="rounded px-3 py-1.5 hover:bg-[--primary]" href="/candidates">Candidates</Link>
              <Link className="rounded px-3 py-1.5 hover:bg-[--primary]" href="/jobs">Jobs</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-6">
          {children}
        </main>
        <footer className="mt-8 border-t border-[--color-border]">
          <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-[--color-muted-foreground]">
            © {new Date().getFullYear()} Talent AI
          </div>
        </footer>
      </body>
    </html>
  );
}
