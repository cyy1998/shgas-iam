import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { FullConfig, Reporter, TestCase, TestError, TestResult, TestStep } from "@playwright/test/reporter";
import { captureCommand } from "../command-runner.ts";
import { apisixErrorLog } from "../hybrid-compose.ts";
import { collectFailureLogs, type EvidenceWindow } from "./failure-logs.ts";
import { publishLastFailure, writeReportHistory } from "./publish-report.ts";
import {
  type BrowserEvidence,
  browserEvidenceAttachment,
  type FailedCase,
  renderFailureReport,
} from "./report-format.ts";
import { reportSecrets, sanitizeReportText } from "./report-redaction.ts";

export interface FailureReporterOptions {
  reportDirectory?: string;
  runId?: string;
  logFiles?: Readonly<Record<string, string | readonly string[]>>;
  apisix?: { project: string; composeFile: string };
}

const defaultReportDirectory = fileURLToPath(new URL("../../.reports/", import.meta.url));

export default class FailureReporter implements Reporter {
  private readonly directory: string;
  private readonly runId: string;
  private readonly secrets = reportSecrets(process.env);
  private readonly failures: FailedCase[] = [];
  private readonly errors: string[] = [];
  private paths?: { json: string; markdown: string };
  private rootDir = process.cwd();

  constructor(private readonly options: FailureReporterOptions = {}) {
    this.directory = resolve(options.reportDirectory ?? defaultReportDirectory);
    this.runId = options.runId ?? randomUUID();
  }

  onConfigure(config: FullConfig) {
    this.rootDir = config.rootDir;
  }

  onBegin() {
    // UI mode runs multiple selections in the same runtime. Workers must share the current selection ID.
    if (process.env.IAM_E2E_CONTEXT_PATH) process.env.IAM_E2E_PLAYWRIGHT_RUN = this.runId;
  }

  onError(error: TestError) {
    this.errors.push(describeError(error));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === test.expectedStatus || result.status === "skipped") return;
    const evidence = readBrowserEvidence(result);
    const start = result.startTime.getTime();
    this.failures.push({
      title: test.titlePath().slice(3).join(" › "),
      project: test.parent.project()?.name ?? "",
      file: relative(this.rootDir, test.location.file),
      line: test.location.line,
      status: result.status,
      retry: result.retry,
      window: evidence?.window ?? { start, end: start + Math.max(0, result.duration) },
      errors: result.errors.map(describeError),
      steps: failedSteps(result.steps),
      artifacts: result.attachments.flatMap(({ name, path }) =>
        path && (name === "trace" || name === "screenshot") ? [{ name, path }] : [],
      ),
      browserErrors: evidence?.browserErrors ?? [],
      responses: evidence?.responses ?? [],
      logs: {},
    });
  }

  async onEnd() {
    if (!this.failures.length && !this.errors.length) return;
    try {
      await this.attachServiceLogs();
      const contents = renderFailureReport(
        { runId: this.runId, errors: this.errors, failures: this.failures },
        this.secrets,
      );
      this.paths = await writeReportHistory(this.directory, this.runId, contents);
      await publishLastFailure(this.directory, this.runId, contents);
    } catch (error) {
      console.error(`E2E failure report publication failed: ${sanitizeReportText(String(error), this.secrets)}`);
      return { status: "failed" as const };
    }
  }

  async onExit() {
    const paths = this.paths;
    if (!paths) return;
    // Playwright UI forwards stdout through its own writer, which does not invoke write callbacks.
    if (!process.stdout.write(`E2E failure summaries: ${paths.markdown} ${paths.json}\n`)) {
      await once(process.stdout, "drain");
    }
  }

  private async attachServiceLogs() {
    const windows = this.failures.map(({ window }) => window);
    if (!windows.length) return;
    const sources = Object.entries(this.options.logFiles ?? {}).map(([name, paths]) => ({
      name,
      lines: () => serviceLines(typeof paths === "string" ? [paths] : paths),
    }));
    const apisix = this.options.apisix;
    if (apisix) sources.push({ name: "apisix", lines: () => apisixLines(apisix, windows) });
    await Promise.all(
      sources.map(async ({ name, lines }) => {
        try {
          const excerpts = await collectFailureLogs(lines(), windows, this.secrets);
          for (const [index, failure] of this.failures.entries()) {
            const excerpt = excerpts[index];
            if (excerpt?.entries.length) {
              Object.defineProperty(failure.logs, name, { value: excerpt, enumerable: true });
            }
          }
        } catch {
          this.errors.push(`Service log unavailable: ${name}`);
        }
      }),
    );
  }
}

function describeError(error: TestError) {
  return error.message ?? error.value ?? error.stack ?? "Unknown Playwright error";
}

function failedSteps(steps: readonly TestStep[]): FailedCase["steps"] {
  return steps.flatMap((step) => [
    ...(step.error ? [{ title: step.title, error: describeError(step.error) }] : []),
    ...failedSteps(step.steps),
  ]);
}

function readBrowserEvidence(result: TestResult): BrowserEvidence | undefined {
  const attachment = result.attachments.find(({ name }) => name === browserEvidenceAttachment);
  if (!attachment?.body) return;
  try {
    const evidence: BrowserEvidence = JSON.parse(attachment.body.toString("utf8"));
    if (
      Number.isFinite(evidence.window.start) &&
      Number.isFinite(evidence.window.end) &&
      evidence.window.end >= evidence.window.start &&
      Array.isArray(evidence.browserErrors) &&
      Array.isArray(evidence.responses)
    )
      return evidence;
  } catch {
    // A terminated worker can leave no usable attachment. Keep the Playwright result and its fallback window.
  }
}

async function* serviceLines(paths: readonly string[]) {
  for (const path of paths) yield* fileLines(resolve(path));
}

async function* fileLines(path: string) {
  const input = createReadStream(path, { encoding: "utf8", signal: AbortSignal.timeout(5_000) });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    yield* lines;
  } finally {
    lines.close();
    input.destroy();
  }
}

async function* apisixLines(source: NonNullable<FailureReporterOptions["apisix"]>, windows: readonly EvidenceWindow[]) {
  const since = new Date(Math.min(...windows.map(({ start }) => start))).toISOString();
  const until = new Date(Math.max(...windows.map(({ end }) => end)) + 1).toISOString();
  const maxBytes = 1024 * 1024;
  const capture = (args: string[]) =>
    captureCommand("docker", ["compose", "--project-name", source.project, "--file", source.composeFile, ...args], {
      cwd: process.cwd(),
      signal: AbortSignal.timeout(10_000),
      capture: { mode: "line-tail", maxBytes },
    });
  const [access, errors] = await Promise.all([
    capture(["logs", "--no-color", "--no-log-prefix", "--timestamps", "--since", since, "--until", until, "apisix"]),
    capture(["exec", "--no-TTY", "apisix", "tail", "-c", String(maxBytes), apisixErrorLog]),
  ]);
  yield* access.stdout.split("\n");
  yield* access.stderr.split("\n");
  yield* errors.stdout.split("\n");
}
