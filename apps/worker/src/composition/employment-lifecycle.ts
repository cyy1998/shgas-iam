import { createOrganizationResponsibilityAssignmentLifecycleStore } from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle-store";
import { EmploymentStatus, OPEN_EMPLOYMENT_STATUSES } from "@iam/contracts";
import type { DbClient, DbTransaction, db as database } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { firstRow } from "@iam/db/query-utils";
import { auditLogs, employments } from "@iam/db/schema";
import { createUserDocumentInvalidation, createUserDocumentWriteResources } from "@iam/documents/user/worker";
import { AuditLogWriteDtoSchema, redactAuditDetails } from "@iam/domain/audit";
import { LoggerSourceApp } from "@iam/runtime/logger";
import { createUnitOfWork, type TransactionalDbPort } from "@iam/unit-of-work";
import type {
  EmploymentSweepAuditEvent,
  EmploymentSweepPhase,
} from "@worker/use-cases/employment/sweep-employments/sweep-employments.port";
import { createSweepEmploymentsUseCase } from "@worker/use-cases/employment/sweep-employments/sweep-employments.use-case";
import type { Json } from "drizzle-orm";
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { startEmploymentSchedule } from "./employment-schedule";
import type { WorkerRuntime } from "./runtime";

const pageSize = 100;

export function startEmploymentLifecycle(db: typeof database, runtime: WorkerRuntime) {
  const producer = createUserDocumentWriteResources({ redis: runtime.config.redis, logger: runtime.logger });
  const boundedDatabase: TransactionalDbPort<DbTransaction> = {
    transaction: (callback) =>
      db.transaction(async (tx) => {
        await setTransactionBudget(tx);
        return await callback(tx);
      }),
  };
  const uow = createUnitOfWork({
    db: boundedDatabase,
    logger: runtime.logger,
    createTxPorts: (tx, lifecycle) => ({
      selectCandidates: (date: string, phase: EmploymentSweepPhase, afterId?: number) =>
        selectCandidates(tx, date, phase, afterId),
      async lockEmployment(id: number) {
        return firstRow(await tx.select().from(employments).where(eq(employments.id, id)).for("update"));
      },
      employmentStore: {
        async updateEmploymentRecord(
          id: number,
          patch: Partial<Pick<typeof employments.$inferInsert, "status" | "isPrimary" | "startTime" | "endTime">>,
        ) {
          return firstRow(
            await tx.update(employments).set(patch).where(eq(employments.id, id)).returning({ id: employments.id }),
          );
        },
      },
      assignments: createOrganizationResponsibilityAssignmentLifecycleStore(tx),
      recordAudit: (event: EmploymentSweepAuditEvent) => recordAudit(tx, event),
      invalidateDocuments: createUserDocumentInvalidation({
        db: tx,
        lifecycle,
        clock: runtime.clock,
        jobProducer: producer.jobProducer,
      }).recordChanges,
    }),
  });

  const sweep = createSweepEmploymentsUseCase({
    uow,
    clock: runtime.clock,
    reportTransitionFailure(candidate, error) {
      runtime.logger.error(
        {
          event: "employment.lifecycle.transition_failed",
          ...candidate,
          errorType: error instanceof Error ? error.name : "UnknownError",
          postgres: extractPostgresError(error) ?? undefined,
        },
        "scheduled Employment transition failed",
      );
    },
  });
  const schedule = startEmploymentSchedule({ clock: runtime.clock, logger: runtime.logger, sweep: sweep.execute });
  return {
    async close() {
      try {
        await schedule.close();
      } finally {
        await producer.close();
      }
    },
  };
}

async function selectCandidates(db: DbClient, date: string, phase: EmploymentSweepPhase, afterId?: number) {
  return await db
    .select({ id: employments.id })
    .from(employments)
    .where(
      and(
        afterId === undefined ? undefined : gt(employments.id, afterId),
        eq(employments.isDelete, false),
        phase === "end"
          ? and(inArray(employments.status, OPEN_EMPLOYMENT_STATUSES), lte(employments.endTime, date))
          : and(
              eq(employments.status, EmploymentStatus.Pending),
              or(isNull(employments.startTime), lte(employments.startTime, date)),
              or(isNull(employments.endTime), gt(employments.endTime, date)),
            ),
      ),
    )
    .orderBy(employments.id)
    .limit(pageSize);
}

async function setTransactionBudget(db: DbTransaction) {
  // Preserve stricter deployment limits and leave the connection's defaults intact.
  await db.execute(sql`SELECT
    set_config('statement_timeout', least(
      coalesce(nullif(extract(epoch FROM current_setting('statement_timeout')::interval)*1000,0),5000),5000
    )::bigint::text || 'ms',true),
    set_config('lock_timeout', least(
      coalesce(nullif(extract(epoch FROM current_setting('lock_timeout')::interval)*1000,0),4000),4000
    )::bigint::text || 'ms',true)`);
}

async function recordAudit(db: DbTransaction, input: EmploymentSweepAuditEvent) {
  const event = AuditLogWriteDtoSchema.parse({
    ...input,
    outcome: "success",
    actorType: "system",
    actorSystemKey: "employment-lifecycle",
    sourceApp: LoggerSourceApp.Worker,
    details: redactAuditDetails(input.details),
  });
  await db.insert(auditLogs).values({ ...event, details: (event.details ?? {}) as Json });
}
