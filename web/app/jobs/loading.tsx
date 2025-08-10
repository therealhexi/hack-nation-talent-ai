import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="mt-6 h-64 w-full" />
    </section>
  );
} 