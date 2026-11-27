import { createLogger, type LoggerConfig } from "@iam/runtime/logger";

import type { runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";

type CommandSignals = NonNullable<Parameters<typeof runMaintenanceCommandWithLifecycle>[0]["signals"]>;

export type CommandContext = CommandSignals & {
  env: NodeJS.ProcessEnv;
  stdout: { write(message: string): unknown };
  stderr: { write(message: string): unknown };
  logger?: typeof createLogger;
};

export function createCommandLogger(context: CommandContext, config: LoggerConfig) {
  return (context.logger ?? createLogger)(config);
}
