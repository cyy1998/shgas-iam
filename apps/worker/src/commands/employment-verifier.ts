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

export async function runEmploymentVerifyCommand(
  deps: EmploymentVerifyCommandDeps,
) {
  deps.logger.info({}, "Employment verification started");
  const report = await deps.verifier.verify();
  deps.logger.info({ ...report }, "Employment verification completed");
  return report;
}

async function main() {
  const { parseEmploymentCommandEnv } = await import("@worker/env");
  const env = parseEmploymentCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createEmploymentCommandComposition } = await import("@worker/composition");
  const composition = createEmploymentCommandComposition({ logger });
  try {
    const report = await runEmploymentVerifyCommand({
      verifier: composition.employment.verifier,
      logger: composition.logger,
    });
    if (report.status === "failed")
      process.exitCode = 1;
  }
  finally {
    await composition.shutdown();
  }
}

if (import.meta.main) {
  try {
    // eslint-disable-next-line antfu/no-top-level-await -- Bun must keep the command alive through database shutdown.
    await main();
  }
  catch {
    process.exitCode = 1;
    process.stderr.write(
      "Employment verification failed; inspect structured logs for the report.\n",
    );
  }
}
