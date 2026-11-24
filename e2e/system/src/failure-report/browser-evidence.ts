import { setTimeout as delay } from "node:timers/promises";
import type { Browser, BrowserContext, ConsoleMessage, Response, TestInfo, WebError } from "@playwright/test";
import { type BrowserEvidence, browserEvidenceAttachment, type FailedResponse } from "./report-format.ts";
import { reportSecrets, sanitizeReportText, sanitizeReportUrl } from "./report-redaction.ts";

const maxEvents = 50;
const maxBodyBytes = 16 * 1024;
const correlationHeaders = ["x-request-id", "traceparent", "x-trace-id", "x-b3-traceid"] as const;

export async function attachBrowserEvidence(
  browser: Browser,
  use: (value: undefined) => Promise<void>,
  testInfo: TestInfo,
) {
  const start = Date.now();
  const secrets = reportSecrets(process.env);
  const browserErrors: BrowserEvidence["browserErrors"] = [];
  const responses: BrowserEvidence["responses"] = [];
  const pending: Promise<void>[] = [];
  const contexts = new Set<BrowserContext>();
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error" && browserErrors.length < maxEvents) {
      browserErrors.push({ type: "console.error", message: sanitizeReportText(message.text(), secrets) });
    }
  };
  const onWebError = (event: WebError) => {
    if (browserErrors.length < maxEvents) {
      browserErrors.push({ type: "pageerror", message: sanitizeReportText(event.error().message, secrets) });
    }
  };
  const onResponse = (response: Response) => {
    if (response.status() < 400 || responses.length >= maxEvents) return;
    const headers = response.headers();
    const captured: FailedResponse = {
      url: sanitizeReportText(sanitizeReportUrl(response.url()), secrets),
      method: response.request().method(),
      status: response.status(),
      headers: {},
    };
    for (const name of correlationHeaders) {
      const value = headers[name];
      if (value && /^[a-z\d_.:-]{1,128}$/iu.test(value)) {
        captured.headers[name] = sanitizeReportText(value, secrets);
      }
    }
    responses.push(captured);
    const contentType = headers["content-type"] ?? "";
    const size = Number(headers["content-length"]);
    if ((contentType.includes("json") || /^text\/plain\b/iu.test(contentType)) && !(size > maxBodyBytes)) {
      pending.push(
        response.body().then(
          (body) => {
            // Chromium returns decoded bytes, which can exceed the wire size or have no wire length.
            if (body.byteLength <= maxBodyBytes) {
              captured.summary = summarizeBody(body.toString("utf8"), contentType, secrets);
            }
          },
          () => undefined,
        ),
      );
    }
  };
  const bind = (context: BrowserContext) => {
    contexts.add(context);
    context.on("console", onConsole);
    context.on("weberror", onWebError);
    context.on("response", onResponse);
  };
  browser.on("context", bind);
  try {
    await use(undefined);
  } finally {
    const end = Date.now();
    browser.off("context", bind);
    for (const context of contexts) {
      context.off("console", onConsole);
      context.off("weberror", onWebError);
      context.off("response", onResponse);
    }
    if (testInfo.status !== testInfo.expectedStatus && testInfo.status !== "skipped") {
      const controller = new AbortController();
      try {
        await Promise.race([Promise.allSettled(pending), delay(250, undefined, { signal: controller.signal })]);
      } finally {
        controller.abort();
      }
      const evidence: BrowserEvidence = { window: { start, end }, browserErrors, responses };
      await testInfo.attach(browserEvidenceAttachment, {
        body: JSON.stringify(evidence),
        contentType: "application/json",
      });
    }
  }
}

function summarizeBody(body: string, contentType: string, secrets: readonly string[]) {
  if (contentType.includes("json")) {
    try {
      const payload: unknown = JSON.parse(body);
      const messages = (Array.isArray(payload) ? payload : [payload]).slice(0, 10).flatMap(responseErrorFields);
      return messages.length ? sanitizeReportText(messages.join("\n"), secrets, 1_000) : undefined;
    } catch {
      return undefined;
    }
  }
  if (/^text\/plain\b/iu.test(contentType)) return sanitizeReportText(body, secrets, 1_000);
}

function responseErrorFields(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const error = "error" in value && value.error && typeof value.error === "object" ? value.error : value;
  const fields: string[] = [];
  if ("message" in error && typeof error.message === "string") fields.push(error.message);
  if ("error" in error && typeof error.error === "string") fields.push(error.error);
  if ("error_description" in error && typeof error.error_description === "string") fields.push(error.error_description);
  if ("code" in error && typeof error.code === "number") fields.push(String(error.code));
  const data = "data" in error ? error.data : undefined;
  if (
    data &&
    typeof data === "object" &&
    "code" in data &&
    typeof data.code === "string" &&
    /^[A-Z_]+$/u.test(data.code)
  ) {
    fields.push(data.code);
  }
  return fields;
}
