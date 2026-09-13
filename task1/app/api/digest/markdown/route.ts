import { runDigest } from "@/lib/digest/run";
import { getCached, setCached } from "@/lib/digest/cache";
import { renderDigestMarkdown } from "@/lib/digest/markdown";

export const maxDuration = 60;

export async function GET() {
  let result = getCached();
  if (!result) {
    result = await runDigest();
    setCached(result);
  }
  const md = renderDigestMarkdown(result);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'inline; filename="policy-radar-digest.md"',
    },
  });
}
