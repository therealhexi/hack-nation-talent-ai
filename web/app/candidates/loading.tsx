import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <section className="mx-auto max-w-5xl">
      <Skeleton className="h-8 w-1/2" />
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </section>
  );
} 