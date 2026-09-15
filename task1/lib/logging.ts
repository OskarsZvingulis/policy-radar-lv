/**
 * Minimal structured logging. Every line carries a run_id plus whatever
 * stage/source context is relevant, as one JSON object — the shape a
 * production log pipeline (Vercel's function logs, Datadog, etc.) expects.
 *
 * When stdout is a TTY (local `npm run dev`, or the screen recording), the
 * same events print as one readable line instead — auto-detected, no flag
 * needed, per the "structured logs, human-readable when interactive" brief.
 */
type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  runId?: string;
  source?: string;
  stage?: string;
  durationMs?: number;
  count?: number;
  error?: string;
  [key: string]: unknown;
}

const isInteractive = typeof process !== "undefined" && Boolean(process.stdout?.isTTY);

function emit(level: Level, msg: string, fields: LogFields): void {
  if (isInteractive) {
    const extra = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    console.log(`[${level.toUpperCase()}] ${msg}${extra ? " " + extra : ""}`);
    return;
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }));
}

export const logger = {
  debug: (msg: string, fields: LogFields = {}) => emit("debug", msg, fields),
  info: (msg: string, fields: LogFields = {}) => emit("info", msg, fields),
  warn: (msg: string, fields: LogFields = {}) => emit("warn", msg, fields),
  error: (msg: string, fields: LogFields = {}) => emit("error", msg, fields),
};

export function newRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
