import type Redis from "ioredis";
import type { Logger } from "pino";

export type OpsLogger = Pick<Logger, "debug" | "info" | "warn" | "error" | "child">;
export interface OpsRuntime {
  redis: Redis;
  clock: { now: () => number; nowDate: () => Date };
}
