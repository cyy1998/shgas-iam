import type { EvidenceWindow, LogExcerpt } from "./failure-logs.ts";
import { sanitizeReportText } from "./report-redaction.ts";

export interface BrowserError {
  type: "console.error" | "pageerror";
  message: string;
}

export interface FailedResponse {
  url: string;
  method: string;
  status: number;
  summary?: string;
  headers: Record<string, string>;
}

export interface BrowserEvidence {
  window: EvidenceWindow;
  browserErrors: BrowserError[];
  responses: FailedResponse[];
}

export const browserEvidenceAttachment = "iam-e2e-browser-evidence";

export interface FailedCase extends BrowserEvidence {
  title: string;
  project: string;
  file: string;
  line: number;
  retry: number;
  status: string;
  errors: string[];
  steps: { title: string; error: string }[];
  artifacts: { name: string; path: string }[];
  logs: Record<string, LogExcerpt>;
}

export interface FailureReport {
  runId: string;
  errors: string[];
  failures: FailedCase[];
}

export function renderFailureReport(report: FailureReport, secrets: readonly string[]) {
  // Every persisted string passes through the same boundary, including titles and artifact paths.
  const json = `${JSON.stringify(report, (_key, value) => (typeof value === "string" ? sanitizeReportText(value, secrets) : value), 2)}\n`;
  const safe: FailureReport = JSON.parse(json);
  const blocks = ["# E2E failure summary", indent([safe.runId])];
  if (safe.errors.length) blocks.push("## Run errors", indent(safe.errors));
  for (const failure of safe.failures) {
    blocks.push(
      "## Failed test",
      indent([
        `${failure.title} [${failure.project}] (${failure.status}, attempt ${failure.retry + 1})`,
        `${failure.file}:${failure.line}`,
        `${new Date(failure.window.start).toISOString()} – ${new Date(failure.window.end).toISOString()}`,
        ...failure.errors,
      ]),
    );
    if (failure.steps.length) {
      blocks.push("### Failed steps", indent(failure.steps.map(({ title, error }) => `${title}\n${error}`)));
    }
    if (failure.artifacts.length) {
      blocks.push("### Playwright artifacts", indent(failure.artifacts.map(({ name, path }) => `${name}: ${path}`)));
    }
    if (failure.browserErrors.length) {
      blocks.push(
        "### Browser errors",
        indent(failure.browserErrors.map(({ type, message }) => `${type}: ${message}`)),
      );
    }
    if (failure.responses.length) {
      blocks.push(
        "### HTTP/tRPC failures",
        indent(
          failure.responses.map(({ method, status, url, summary, headers }) =>
            [
              `${method} ${status} ${url}`,
              ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
              summary,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ),
      );
    }
    if (Object.keys(failure.logs).length) {
      blocks.push(
        "### Service logs",
        indent(
          Object.entries(failure.logs).flatMap(([service, { entries, omitted }]) => [
            service,
            ...entries.map(({ text, count }) => (count > 1 ? `[${count} occurrences] ${text}` : text)),
            ...(omitted ? [`[${omitted} additional lines omitted]`] : []),
          ]),
        ),
      );
    }
  }
  return { json, markdown: `${blocks.join("\n\n")}\n` };
}

function indent(lines: readonly string[]) {
  return lines
    .join("\n")
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}
