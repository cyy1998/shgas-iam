import { fileURLToPath } from "node:url";
import type { ReporterDescription } from "@playwright/test";
import type { FailureReporterOptions } from "./failure-reporter.ts";

const reporterPath = fileURLToPath(new URL("./failure-reporter.ts", import.meta.url));

export function createFailureReporters(
  options: FailureReporterOptions = {},
  interactive = process.stdout.isTTY,
): ReporterDescription[] {
  return [[interactive ? "list" : "line"], [reporterPath, options]];
}
