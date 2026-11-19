import { writeFile } from "node:fs/promises";
import { freemem } from "node:os";
import { join } from "node:path";

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

interface MemoryReading {
  freePhysicalBytes: number;
  committedBytes?: number;
  commitLimitBytes?: number;
}

interface MemoryReader {
  source: string;
  read(): MemoryReading;
  close?(): void;
}

interface StageReading {
  stage: E2eStage;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  samples: number;
  minFreePhysicalBytes?: number;
  startCommittedBytes?: number;
  startCommitHeadroomBytes?: number;
  minCommitHeadroomBytes?: number;
  peakCommittedBytes?: number;
}

const intervalMs = 250;

export async function createStageMemoryProfile(): Promise<StageMemoryProfile> {
  const memory: MemoryReader = (await windowsMemoryReader()) ?? {
    source: "os.freemem",
    read: () => ({ freePhysicalBytes: freemem() }),
  };
  const stages: StageReading[] = [];
  let current: StageReading | undefined;
  let startedAtMs = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let finished = false;

  function sample() {
    if (!current) return;
    let reading: MemoryReading;
    try {
      reading = memory.read();
    } catch {
      return;
    }
    const { freePhysicalBytes, committedBytes, commitLimitBytes } = reading;
    current.samples++;
    current.minFreePhysicalBytes = Math.min(current.minFreePhysicalBytes ?? freePhysicalBytes, freePhysicalBytes);
    if (committedBytes === undefined || commitLimitBytes === undefined) return;
    const headroom = commitLimitBytes - committedBytes;
    current.startCommittedBytes ??= committedBytes;
    current.startCommitHeadroomBytes ??= headroom;
    current.minCommitHeadroomBytes = Math.min(current.minCommitHeadroomBytes ?? headroom, headroom);
    current.peakCommittedBytes = Math.max(current.peakCommittedBytes ?? committedBytes, committedBytes);
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
      memory.close?.();
      await writeFile(
        join(artifactDirectory, "host-memory.json"),
        `${JSON.stringify({ version: 1, platform: process.platform, source: memory.source, intervalMs, stages }, null, 2)}\n`,
      );
    },
  };
}

async function windowsMemoryReader(): Promise<MemoryReader | undefined> {
  if (process.platform !== "win32" || (process.arch !== "x64" && process.arch !== "arm64")) return;
  try {
    const { dlopen, ptr } = await import("bun:ffi");
    const library = dlopen("kernel32.dll", {
      K32GetPerformanceInfo: { args: ["ptr", "u32"], returns: "i32" },
    });
    // PERFORMANCE_INFORMATION contains a DWORD, ten aligned SIZE_T fields and three DWORDs on 64-bit Windows.
    const buffer = new ArrayBuffer(104);
    const data = new DataView(buffer);
    data.setUint32(0, buffer.byteLength, true);
    const address = ptr(buffer);
    return {
      source: "windows-performance-information",
      read() {
        if (library.symbols.K32GetPerformanceInfo(address, buffer.byteLength) === 0)
          return { freePhysicalBytes: freemem() };
        const pageSize = data.getBigUint64(80, true);
        return {
          committedBytes: Number(data.getBigUint64(8, true) * pageSize),
          commitLimitBytes: Number(data.getBigUint64(16, true) * pageSize),
          freePhysicalBytes: Number(data.getBigUint64(40, true) * pageSize),
        };
      },
      close: () => library.close(),
    };
  } catch {
    return undefined;
  }
}
