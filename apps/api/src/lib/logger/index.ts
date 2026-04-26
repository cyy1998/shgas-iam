import type { TransportTargetOptions } from "pino";
import pino from "pino";
import config from "@/env";
import { createSingleton } from "../core/singleton";

function buildTransportTargets(): TransportTargetOptions[] {
  const targets: TransportTargetOptions[] = [];

  if (config.NODE_ENV === "development") {
    targets.push({ target: "pino-pretty", level: config.LOG_LEVEL || "info", options: {} });
  }
  else {
    targets.push({ target: "pino/file", level: config.LOG_LEVEL || "info", options: { destination: 1 } });
  }

  return targets;
}

export const logger = createSingleton("logger", () =>
  pino({ level: config.LOG_LEVEL || "info" }, pino.transport({ targets: buildTransportTargets() })));
