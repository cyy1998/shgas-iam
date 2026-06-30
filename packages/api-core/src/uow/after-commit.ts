import type { ObservabilityContext } from "../observability";
import { observabilityLogFields } from "../observability";
import { AfterCommitRequiredTaskError } from "./errors";

export type AfterCommitTaskMode = "required" | "bestEffort";

export type AfterCommitTaskCallback = () => Promise<void> | void;

export interface AfterCommitTask {
  name: string;
  mode: AfterCommitTaskMode;
  callback: AfterCommitTaskCallback;
}
export interface AfterCommitTaskFailure {
  name: string;
  mode: AfterCommitTaskMode;
  error: unknown;
}

export interface AfterCommitLoggerPort {
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface AfterCommitRegistrationPort {
  required: (name: string, callback: AfterCommitTaskCallback) => void;
  bestEffort: (name: string, callback: AfterCommitTaskCallback) => void;
}

export interface AfterCommitPort {
  afterCommit: AfterCommitRegistrationPort;
}

export function createAfterCommitPort(tasks: AfterCommitTask[]): AfterCommitPort {
  return {
    afterCommit: {
      required(name, callback) {
        tasks.push({ name, mode: "required", callback });
      },
      bestEffort(name, callback) {
        tasks.push({ name, mode: "bestEffort", callback });
      },
    },
  };
}

export async function runAfterCommitTasks(
  tasks: readonly AfterCommitTask[],
  logger: AfterCommitLoggerPort,
  observability?: ObservabilityContext | null,
): Promise<void> {
  const requiredFailures: AfterCommitTaskFailure[] = [];

  for (const task of tasks) {
    try {
      await task.callback();
    }
    catch (err) {
      const logFields = {
        afterCommit: task.name,
        mode: task.mode,
        err,
        ...observabilityLogFields(observability),
      };
      if (task.mode === "required") {
        logger.error(logFields, "required afterCommit task failed");
        requiredFailures.push({ name: task.name, mode: task.mode, error: err });
      }
      else {
        logger.warn(logFields, "best-effort afterCommit task failed");
      }
    }
  }

  if (requiredFailures.length > 0) {
    throw new AfterCommitRequiredTaskError(requiredFailures);
  }
}
