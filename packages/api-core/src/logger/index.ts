import type { TransportTargetOptions } from "pino";
import pino from "pino";
import { createSingleton } from "../core/singleton";

export type LoggerConfig = {
  nodeEnv: string;
  logLevel?: string;
};

function buildTransportTargets(config: LoggerConfig): TransportTargetOptions[] {
  const level = config.logLevel || "info";
  if (config.nodeEnv === "development") {
    return [{ target: "pino-pretty", level, options: {} }];
  }
  return [{ target: "pino/file", level, options: { destination: 1 } }];
}

export function createLogger(config: LoggerConfig) {
  return createSingleton("logger", () =>
    pino({ level: config.logLevel || "info" }, pino.transport({ targets: buildTransportTargets(config) })));
}
