import { sanitizeReportText } from "./report-redaction.ts";

export interface EvidenceWindow {
  start: number;
  end: number;
}

interface LogEntry {
  text: string;
  count: number;
}

export interface LogExcerpt {
  entries: LogEntry[];
  omitted: number;
}

interface DiagnosticLine {
  time: number;
  precisionMs?: number;
  text: string;
}

export async function collectFailureLogs(
  lines: AsyncIterable<string> | Iterable<string>,
  windows: readonly EvidenceWindow[],
  secrets: readonly string[],
): Promise<LogExcerpt[]> {
  const excerpts = windows.map(() => ({ entries: new Map<string, LogEntry>(), omitted: 0 }));
  for await (const line of lines) {
    const diagnostic = parseDiagnostic(line);
    if (!diagnostic) continue;
    const text = sanitizeReportText(diagnostic.text, secrets).replace(/\s*\n\s*/gu, " ");
    for (const [index, { start, end }] of windows.entries()) {
      const excerpt = excerpts[index];
      if (!excerpt || diagnostic.time + (diagnostic.precisionMs ?? 1) - 1 < start || diagnostic.time > end) continue;
      const existing = excerpt.entries.get(text);
      if (existing) existing.count++;
      else if (excerpt.entries.size < 200) excerpt.entries.set(text, { text, count: 1 });
      else excerpt.omitted++;
    }
  }
  return excerpts.map(({ entries, omitted }) => ({ entries: [...entries.values()], omitted }));
}

function parseDiagnostic(line: string): DiagnosticLine | undefined {
  // Reject oversized lines whole, so a partial credential never reaches the sanitizer.
  if (line.length > 64 * 1024) return;
  const timestamp = /^(\d{4}-\d\d-\d\dT\S+)\s+(.*)$/u.exec(line);
  const time = Date.parse(timestamp?.[1] ?? "");
  const content = timestamp?.[2] ?? line;
  if (content.startsWith("{")) return structuredDiagnostic(content, time);

  const access = /"([A-Z]+) (\/[^"\s]*)(?: HTTP\/[^"]+)?"\s+(5\d\d)\b(?:\s+\S+\s+"([^"]+)")?/u.exec(content);
  if (access && Number.isFinite(time)) {
    const [, method, path, status, requestId] = access;
    if (healthPath(path)) return;
    return {
      time,
      text: `${method} ${path} ${status}${requestId && requestId !== "-" ? ` requestId=${requestId}` : ""}`,
    };
  }

  const error = /\[(?:warn|error|crit|alert|emerg)\]\s+(?:\d+#\d+:\s+(?:\*\d+\s+)?)?(.+)$/iu.exec(content)?.[1];
  if (error && !healthPath(/(?:request: "|\b)(?:GET|HEAD) (\/[^\s"]+)/u.exec(error)?.[1])) {
    if (Number.isFinite(time)) return { time, text: error };
    // APISIX writes its container-local NGINX timestamps at one-second precision in UTC.
    const nginx = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d:\d\d:\d\d) \[/u.exec(content);
    if (nginx) {
      const errorTime = Date.parse(`${nginx[1]}-${nginx[2]}-${nginx[3]}T${nginx[4]}Z`);
      if (Number.isFinite(errorTime)) return { time: errorTime, precisionMs: 1_000, text: error };
    }
  }
}

function structuredDiagnostic(content: string, fallbackTime: number): DiagnosticLine | undefined {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content);
  } catch {
    return;
  }
  const time =
    typeof data.time === "number" ? data.time : typeof data.time === "string" ? Date.parse(data.time) : fallbackTime;
  if (!Number.isFinite(time) || healthPath(data.path) || healthPath(data.route)) return;
  const level = data.level;
  const severe = (typeof level === "number" && level >= 40) || /^(?:warn(?:ing)?|error|fatal)$/iu.test(String(level));
  const status = Number(data.statusCode ?? data.status);
  if (!severe && !(status >= 500 && status <= 599)) return;
  const error: unknown = data.err;
  const errorMessage = error && typeof error === "object" && "message" in error ? error.message : undefined;
  const text = [
    data.event,
    data.msg,
    errorMessage,
    data.path,
    data.statusCode ?? data.status,
    data.requestId,
    data.traceId,
  ]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ");
  if (text) return { time, text };
}

function healthPath(path: unknown) {
  return typeof path === "string" && /^\/(?:[^/?#]+\/)*(?:health[z]?|readiness|readyz|livez)(?:[/?#]|$)/iu.test(path);
}
