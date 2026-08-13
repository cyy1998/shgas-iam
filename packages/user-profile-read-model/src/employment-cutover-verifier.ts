import type {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
} from "@iam/contracts";
import {
  EmploymentStatus as EmploymentStatusValue,
  OrganizationStatus as OrganizationStatusValue,
  PositionStatus as PositionStatusValue,
} from "@iam/contracts";

const EMPLOYMENT_CUTOVER_FAILURE_CODES = [
  "unknown-employment-status",
  "position-not-effective",
  "organization-not-effective",
  "invalid-employment-period",
  "open-employment-has-end-time",
  "ended-employment-missing-end-time",
  "future-open-start-time",
  "duplicate-open-employment",
  "multiple-open-primary-employments",
] as const;

export type EmploymentCutoverFailureCode
  = typeof EMPLOYMENT_CUTOVER_FAILURE_CODES[number];

export interface EmploymentCutoverInventoryRow {
  id: number;
  userId: number;
  positionId: number;
  organizationId: number;
  isPrimary: boolean;
  status: number;
  startTime: Date;
  endTime: Date | null;
  isDelete: boolean;
  positionStatus: PositionStatus | null;
  positionDeleted: boolean | null;
  organizationStatus: OrganizationStatus | null;
  organizationDeleted: boolean | null;
}

export interface CreateEmploymentCutoverVerifierDeps {
  inventory: {
    readAll: () => Promise<EmploymentCutoverInventoryRow[]>;
  };
  clock: {
    nowDate: () => Date;
  };
}

export interface EmploymentCutoverVerificationFailure {
  code: EmploymentCutoverFailureCode;
  count: number;
  employmentIds: number[];
}

export interface EmploymentCutoverVerificationReport {
  version: 1;
  verifiedAt: string;
  status: "failed" | "passed";
  counts: {
    employments: number;
    legacyTombstones: number;
    blockingEmployments: number;
  };
  failures: EmploymentCutoverVerificationFailure[];
}

export function createEmploymentCutoverVerifier(
  deps: CreateEmploymentCutoverVerifierDeps,
) {
  async function verify(): Promise<EmploymentCutoverVerificationReport> {
    const verifiedAt = deps.clock.nowDate();
    const rows = await deps.inventory.readAll();
    const failures = createFailureAccumulator();

    for (const row of rows) {
      if (row.isDelete)
        continue;
      if (!isKnownEmploymentStatus(row.status)) {
        failures.add("unknown-employment-status", row.id);
      }
      else if (isOpenEmploymentStatus(row.status)) {
        if (
          row.positionStatus !== PositionStatusValue.Enable
          || row.positionDeleted !== false
        ) {
          failures.add("position-not-effective", row.id);
        }
        if (
          row.organizationStatus !== OrganizationStatusValue.Enable
          || row.organizationDeleted !== false
        ) {
          failures.add("organization-not-effective", row.id);
        }
        if (row.endTime !== null) {
          failures.add("open-employment-has-end-time", row.id);
        }
        if (row.startTime.getTime() > verifiedAt.getTime()) {
          failures.add("future-open-start-time", row.id);
        }
      }
      else if (row.endTime === null) {
        failures.add("ended-employment-missing-end-time", row.id);
      }
      if (
        row.endTime !== null
        && row.endTime.getTime() <= row.startTime.getTime()
      ) {
        failures.add("invalid-employment-period", row.id);
      }
    }

    const openRows = rows.filter(row =>
      !row.isDelete
      && isKnownEmploymentStatus(row.status)
      && isOpenEmploymentStatus(row.status));
    collectGroupConflict(
      openRows,
      failures,
      "duplicate-open-employment",
      row => `${row.userId}:${row.organizationId}:${row.positionId}`,
    );
    collectGroupConflict(
      openRows.filter(row => row.isPrimary),
      failures,
      "multiple-open-primary-employments",
      row => row.userId,
    );
    const failureReport = failures.report();

    return {
      version: 1 as const,
      verifiedAt: verifiedAt.toISOString(),
      status: failureReport.length === 0 ? "passed" as const : "failed" as const,
      counts: {
        employments: rows.length,
        legacyTombstones: rows.filter(row => row.isDelete).length,
        blockingEmployments: failures.blockingEmploymentCount(),
      },
      failures: failureReport,
    };
  }

  return { verify };
}

function isOpenEmploymentStatus(status: EmploymentStatus) {
  return status === EmploymentStatusValue.Enable
    || status === EmploymentStatusValue.Pause;
}

function isKnownEmploymentStatus(status: number): status is EmploymentStatus {
  return status === EmploymentStatusValue.Enable
    || status === EmploymentStatusValue.Pause
    || status === EmploymentStatusValue.Disable;
}

function collectGroupConflict<TKey>(
  rows: EmploymentCutoverInventoryRow[],
  failures: ReturnType<typeof createFailureAccumulator>,
  code: EmploymentCutoverFailureCode,
  groupKey: (row: EmploymentCutoverInventoryRow) => TKey,
) {
  const groups = new Map<TKey, EmploymentCutoverInventoryRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2)
      continue;
    for (const row of group)
      failures.add(code, row.id);
  }
}

function createFailureAccumulator() {
  const failures = new Map<EmploymentCutoverFailureCode, number[]>();
  const blockingEmploymentIds = new Set<number>();
  function add(code: EmploymentCutoverFailureCode, employmentId: number) {
    const employmentIds = failures.get(code) ?? [];
    employmentIds.push(employmentId);
    failures.set(code, employmentIds);
    blockingEmploymentIds.add(employmentId);
  }
  function report(): EmploymentCutoverVerificationFailure[] {
    return [...failures.entries()]
      .sort(([left], [right]) => failureOrder(left) - failureOrder(right))
      .map(([code, employmentIds]) => ({
        code,
        count: employmentIds.length,
        employmentIds: employmentIds.sort((left, right) => left - right),
      }));
  }
  return {
    add,
    blockingEmploymentCount: () => blockingEmploymentIds.size,
    report,
  };
}

function failureOrder(code: EmploymentCutoverFailureCode) {
  return EMPLOYMENT_CUTOVER_FAILURE_CODES.indexOf(code);
}
