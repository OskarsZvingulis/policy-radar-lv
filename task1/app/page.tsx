import { Suspense } from "react";
import { getCached } from "@/lib/digest/cache";
import { DigestApp } from "@/components/digest/digest-app";
import { ListSkeleton } from "@/components/digest/list-skeleton";

// Never statically prerendered — reads live in-memory cache state per request.
export const dynamic = "force-dynamic";

export default function Home() {
  const cached = getCached();
  return (
    <Suspense fallback={<ListSkeleton />}>
      <DigestApp initialData={cached} />
    </Suspense>
  );
}
