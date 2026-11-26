import { freemem } from "node:os";
import { join } from "node:path";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";

export type E2eStage =
  | "build"
  | "infrastructure"
  | "migration"
  | "application-startup"
  | "seed"
  | "gateway-readiness"
  | "browser"
  | "diagnostics"
  | "cleanup";

export interface StageMemoryProfile {
  enter(stage: E2eStage): void;
  finish(artifactDirectory: string): Promise<void>;
}

interface StageReading {
  stage: E2eStage;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  samples: number;
  minFreePhysicalBytes?: number;
}

const intervalMs = 250;

export function createStageMemoryProfile(): StageMemoryProfile {
  const stages: StageReading[] = [];
  let current: StageReading | undefined;
  let startedAtMs = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let finished = false;

  function sample() {
    if (!current) return;
    const freePhysicalBytes = freemem();
    current.samples++;
    current.minFreePhysicalBytes = Math.min(current.minFreePhysicalBytes ?? freePhysicalBytes, freePhysicalBytes);
  }

  function endCurrentStage() {
    if (!current) return;
    sample();
    current.endedAt = new Date().toISOString();
    current.durationMs = Math.round(performance.now() - startedAtMs);
  }

  return {
    enter(stage) {
      if (finished) return;
      endCurrentStage();
      startedAtMs = performance.now();
      current = {
        stage,
        startedAt: new Date().toISOString(),
        samples: 0,
      };
      stages.push(current);
      sample();
      timer ??= setInterval(sample, intervalMs).unref();
    },
    async finish(artifactDirectory) {
      finished = true;
      clearInterval(timer);
      endCurrentStage();
      await writeAtomicJsonFile(
        join(artifactDirectory, "host-memory.json"),
        { version: 1, platform: process.platform, source: "os.freemem", intervalMs, stages },
        0o600,
      );
    },
  };
}
