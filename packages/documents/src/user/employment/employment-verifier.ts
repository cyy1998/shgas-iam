import type { EmploymentStatus, OrganizationStatus, PositionStatus } from "@iam/contracts";
import {
  EmploymentStatus as EmploymentStatusValue,
  isOpenEmploymentStatus,
  OrganizationStatus as OrganizationStatusValue,
  PositionStatus as PositionStatusValue,
} from "@iam/contracts";

const EMPLOYMENT_FAILURE_CODES = [
  "unknown-employment-status",
  "position-not-effective",
  "organization-not-effective",
  "invalid-employment-period",
  "ended-employment-missing-end-time",
  "duplicate-open-employment",
  "multiple-open-primary-employments",
] as const;

export type EmploymentFailureCode = (typeof EMPLOYMENT_FAILURE_CODES)[number];

export interface EmploymentInventoryRow {
  id: number;
  userId: number;
  positionId: number;
  organizationId: number;
  isPrimary: boolean;
  status: number;
  startTime: string | null;
  endTime: string | null;
  isDelete: boolean;
  positionStatus: PositionStatus | null;
  positionDeleted: boolean | null;
  organizationStatus: OrganizationStatus | null;
  organizationDeleted: boolean | null;
}

export interface CreateEmploymentVerifierDeps {
  inventory: {
    readAll: () => Promise<EmploymentInventoryRow[]>;
  };
  clock: {
    nowDate: () => Date;
  };
}

export interface EmploymentVerificationFailure {
  code: EmploymentFailureCode;
  count: number;
  employmentIds: number[];
}

export interface EmploymentVerificationReport {
  version: 1;
  verifiedAt: string;
  status: "failed" | "passed";
  counts: {
    employments: number;
    legacyTombstones: number;
    blockingEmployments: number;
  };
  failures: EmploymentVerificationFailure[];
}

export function createEmploymentVerifier(deps: CreateEmploymentVerifierDeps) {
  async function verify(): Promise<EmploymentVerificationReport> {
    const verifiedAt = deps.clock.nowDate();
    const rows = await deps.inventory.readAll();
    const failures = createFailureAccumulator();

    for (const row of rows) {
      if (row.isDelete) continue;
      if (!isKnownEmploymentStatus(row.status)) {
        failures.add("unknown-employment-status", row.id);
      } else if (isOpenEmploymentStatus(row.status)) {
        if (row.positionStatus !== PositionStatusValue.Enable || row.positionDeleted !== false) {
          failures.add("position-not-effective", row.id);
        }
        if (row.organizationStatus !== OrganizationStatusValue.Enable || row.organizationDeleted !== false) {
          failures.add("organization-not-effective", row.id);
        }
      } else if (row.endTime === null) {
        failures.add("ended-employment-missing-end-time", row.id);
      }
      if (row.startTime !== null && row.endTime !== null && row.endTime <= row.startTime) {
        failures.add("invalid-employment-period", row.id);
      }
    }

    const openRows = rows.filter((row) => !row.isDelete && isOpenEmploymentStatus(row.status));
    collectGroupConflict(
      openRows,
      failures,
      "duplicate-open-employment",
      (row) => `${row.userId}:${row.organizationId}:${row.positionId}`,
    );
    collectGroupConflict(
      openRows.filter((row) => row.isPrimary),
      failures,
      "multiple-open-primary-employments",
      (row) => row.userId,
    );
    const failureReport = failures.report();

    return {
      version: 1 as const,
      verifiedAt: verifiedAt.toISOString(),
      status: failureReport.length === 0 ? ("passed" as const) : ("failed" as const),
      counts: {
        employments: rows.length,
        legacyTombstones: rows.filter((row) => row.isDelete).length,
        blockingEmployments: failures.blockingEmploymentCount(),
      },
      failures: failureReport,
    };
  }

  return { verify };
}

function isKnownEmploymentStatus(status: number): status is EmploymentStatus {
  return isOpenEmploymentStatus(status) || status === EmploymentStatusValue.Disable;
}

function collectGroupConflict<TKey>(
  rows: EmploymentInventoryRow[],
  failures: ReturnType<typeof createFailureAccumulator>,
  code: EmploymentFailureCode,
  groupKey: (row: EmploymentInventoryRow) => TKey,
) {
  const groups = new Map<TKey, EmploymentInventoryRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const row of group) failures.add(code, row.id);
  }
}

function createFailureAccumulator() {
  const failures = new Map<EmploymentFailureCode, number[]>();
  const blockingEmploymentIds = new Set<number>();
  function add(code: EmploymentFailureCode, employmentId: number) {
    const employmentIds = failures.get(code) ?? [];
    employmentIds.push(employmentId);
    failures.set(code, employmentIds);
    blockingEmploymentIds.add(employmentId);
  }
  function report(): EmploymentVerificationFailure[] {
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

function failureOrder(code: EmploymentFailureCode) {
  return EMPLOYMENT_FAILURE_CODES.indexOf(code);
}
