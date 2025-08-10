import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <section className="mx-auto max-w-4xl">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="mt-2 h-5 w-1/3" />
      <Skeleton className="mt-6 h-40 w-full" />
    </section>
  );
} 