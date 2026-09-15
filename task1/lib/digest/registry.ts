/**
 * The one list of sources.
 *
 * The orchestrator and the UI each used to carry their own copy, the UI's
 * marked "must mirror run.ts" — a comment is not a mechanism, and the two
 * drifted: the page subtitle counted one list while the chips rendered the
 * other. Labels live here, collectors are bound in run.ts, and the client
 * imports only the labels (this file pulls in no collector code, so it is
 * safe to import from a client component).
 */
import type { SourceId } from "../types";

export interface SourceInfo {
  id: SourceId;
  label: string;
}

export const SOURCE_REGISTRY: SourceInfo[] = [
  { id: "tap_legal_acts", label: "TAP portāls: Tiesību aktu projekti" },
  { id: "tap_consultations", label: "TAP portāls: Sabiedrības līdzdalība" },
  { id: "tap_vss", label: "Valsts sekretāru sanāksme" },
  { id: "tap_mk", label: "Ministru kabineta sēdes" },
  { id: "saeima_committees", label: "Saeima: komisiju sēdes" },
  { id: "em_news", label: "Ekonomikas ministrija" },
  { id: "liaa_news", label: "LIAA" },
  { id: "altum_news", label: "Altum" },
];

export const SOURCE_COUNT = SOURCE_REGISTRY.length;

export function sourceLabel(id: SourceId): string {
  return SOURCE_REGISTRY.find((s) => s.id === id)?.label ?? id;
}
