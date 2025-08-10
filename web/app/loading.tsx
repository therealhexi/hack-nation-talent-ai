import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <section className="mx-auto max-w-6xl">
      <div className="grid gap-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </section>
  );
} 