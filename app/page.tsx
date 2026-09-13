import { getCached } from "@/lib/digest/cache";
import { DigestView } from "@/components/digest-view";

// Never statically prerendered — reads live in-memory cache state per request.
export const dynamic = "force-dynamic";

export default function Home() {
  const cached = getCached();
  return <DigestView initialData={cached} />;
}
