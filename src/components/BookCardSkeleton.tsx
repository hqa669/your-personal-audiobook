import { Skeleton } from "@/components/ui/skeleton";

export const BookCardSkeleton = () => {
  return (
    <div className="w-[140px] sm:w-[160px] flex-shrink-0 snap-start">
      <div className="relative aspect-[2/3] mb-2">
        <Skeleton className="absolute inset-0 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
};
