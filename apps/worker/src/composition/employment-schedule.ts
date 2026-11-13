import { EMPLOYMENT_TIME_ZONE, getEmploymentDate } from "@iam/domain/employment/employment-date";
import type { WorkerLogger } from "./runtime";

interface EmploymentSweepResult {
  ended: number;
  enabled: number;
  failed: number;
}

export function startEmploymentSchedule(options: {
  clock: { nowDate: () => Date };
  logger: Pick<WorkerLogger, "info" | "error">;
  sweep: (date: string, signal: AbortSignal) => Promise<EmploymentSweepResult>;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;

  async function run() {
    const startedAt = options.clock.nowDate();
    const date = getEmploymentDate(startedAt);
    const nextMidnight = Temporal.Instant.fromEpochMilliseconds(startedAt.getTime())
      .toZonedDateTimeISO(EMPLOYMENT_TIME_ZONE)
      .add({ days: 1 })
      .startOfDay().epochMilliseconds;
    const started = performance.now();
    options.logger.info({ event: "employment.lifecycle.started", date }, "scheduled Employment sweep started");
    try {
      const result = await options.sweep(date, controller.signal);
      const event =
        result.failed > 0
          ? "failed"
          : controller.signal.aborted
            ? "stopped"
            : getEmploymentDate(options.clock.nowDate()) !== date
              ? "superseded"
              : "completed";
      const log = { event: `employment.lifecycle.${event}`, date, durationMs: performance.now() - started, ...result };
      if (result.failed > 0) {
        options.logger.error(log, "scheduled Employment sweep left work for the next run");
      } else {
        options.logger.info(log, "scheduled Employment sweep finished");
      }
    } catch (error) {
      options.logger.error(
        { event: "employment.lifecycle.failed", date, errorType: error instanceof Error ? error.name : "UnknownError" },
        "scheduled Employment sweep failed; durable work remains for the next run",
      );
    } finally {
      if (!controller.signal.aborted) {
        timer = setTimeout(onMidnight, Math.max(0, nextMidnight - options.clock.nowDate().getTime()));
      }
    }

    function onMidnight() {
      if (controller.signal.aborted) return;
      const remaining = nextMidnight - options.clock.nowDate().getTime();
      if (remaining > 0) {
        timer = setTimeout(onMidnight, remaining);
      } else {
        active = run();
      }
    }
  }

  active = run();
  return {
    async close() {
      controller.abort();
      clearTimeout(timer);
      await active;
    },
  };
}
