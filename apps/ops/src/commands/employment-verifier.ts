import { parseArgs } from "node:util";
import { closeMaintenanceResources } from "@iam/runtime/maintenance";
import { type CommandContext, createCommandLogger } from "@ops/command-context";

export interface EmploymentVerifyCommandReport {
  version: 1;
  verifiedAt: string;
  status: "failed" | "passed";
  counts: {
    employments: number;
    legacyTombstones: number;
    blockingEmployments: number;
  };
  failures: Array<{
    code: string;
    count: number;
    employmentIds: number[];
  }>;
}

export interface EmploymentVerifyCommandDeps {
  verifier: {
    verify: () => Promise<EmploymentVerifyCommandReport>;
  };
  logger: {
    info: (data: Record<string, unknown>, message: string) => void;
  };
}

export async function runEmploymentVerifyCommand(deps: EmploymentVerifyCommandDeps) {
  deps.logger.info({}, "Employment verification started");
  const report = await deps.verifier.verify();
  deps.logger.info({ ...report }, "Employment verification completed");
  return report;
}

async function main(args: string[], context: CommandContext) {
  parseArgs({ args, strict: true, allowPositionals: false, options: {} });
  const { parseEmploymentCommandEnv } = await import("@ops/env");
  const env = parseEmploymentCommandEnv(context.env, context.stderr);
  const { LoggerSourceApp } = await import("@iam/runtime/logger");
  const logger = createCommandLogger(context, {
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Ops,
  });
  const { createEmploymentCommandComposition } = await import("@ops/composition/employment-command");
  const composition = createEmploymentCommandComposition({ databaseUrl: env.databaseUrl, logger });
  try {
    const report = await runEmploymentVerifyCommand({
      verifier: composition.employment.verifier,
      logger: composition.logger,
    });
    if (report.status === "failed") context.exitCode = 1;
  } catch (error) {
    await closeMaintenanceResources([Promise.reject(error), composition.shutdown()]);
  }
  await composition.shutdown();
}

export async function run(args: string[], context: CommandContext = process) {
  try {
    await main(args, context);
  } catch {
    context.exitCode = 1;
    context.stderr.write("Employment verification failed; inspect structured logs for the report.\n");
  }
}
