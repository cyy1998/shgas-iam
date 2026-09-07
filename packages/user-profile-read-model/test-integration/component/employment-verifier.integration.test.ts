import type { EmploymentInventoryRow } from "@iam/user-profile-read-model/worker";
import { EmploymentStatus, OrganizationStatus, PositionStatus } from "@iam/contracts";
import { createEmploymentVerifier } from "@iam/user-profile-read-model/worker";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2026-08-11T12:00:00.000Z");

describe("Employment verifier", () => {
  test("fails with a stable category for a non-tombstone unknown status", async () => {
    const verifier = createEmploymentVerifier({
      inventory: {
        readAll: async () => [employment({ id: 41, status: 99 })],
      },
      clock: { nowDate: () => NOW },
    });

    expect(await verifier.verify()).toEqual({
      version: 1,
      verifiedAt: NOW.toISOString(),
      status: "failed",
      counts: {
        employments: 1,
        legacyTombstones: 0,
        blockingEmployments: 1,
      },
      failures: [{
        code: "unknown-employment-status",
        count: 1,
        employmentIds: [41],
      }],
    });
  });

  test("reports every Open Employment whose Position or Organization is not effective", async () => {
    const verifier = createEmploymentVerifier({
      inventory: {
        readAll: async () => [
          employment({ id: 42, positionId: 42, positionStatus: PositionStatus.Pause }),
          employment({ id: 43, positionId: 43, positionDeleted: true }),
          employment({ id: 44, organizationId: 44, organizationStatus: OrganizationStatus.Disable }),
          employment({ id: 45, organizationId: 45, organizationStatus: null, organizationDeleted: null }),
        ],
      },
      clock: { nowDate: () => NOW },
    });

    expect((await verifier.verify()).failures).toEqual([{
      code: "position-not-effective",
      count: 2,
      employmentIds: [42, 43],
    }, {
      code: "organization-not-effective",
      count: 2,
      employmentIds: [44, 45],
    }]);
  });

  test("classifies invalid, contradictory, and unsupported Employment periods", async () => {
    const verifier = createEmploymentVerifier({
      inventory: {
        readAll: async () => [
          employment({ id: 50, positionId: 50, endTime: new Date("2026-08-10T00:00:00.000Z") }),
          employment({ id: 51, status: EmploymentStatus.Disable }),
          employment({
            id: 52,
            status: EmploymentStatus.Disable,
            endTime: new Date("2026-08-01T00:00:00.000Z"),
          }),
          employment({
            id: 53,
            positionId: 53,
            status: EmploymentStatus.Pause,
            startTime: new Date("2026-08-12T00:00:00.000Z"),
          }),
        ],
      },
      clock: { nowDate: () => NOW },
    });

    expect((await verifier.verify()).failures).toEqual([{
      code: "invalid-employment-period",
      count: 1,
      employmentIds: [52],
    }, {
      code: "open-employment-has-end-time",
      count: 1,
      employmentIds: [50],
    }, {
      code: "ended-employment-missing-end-time",
      count: 1,
      employmentIds: [51],
    }, {
      code: "future-open-start-time",
      count: 1,
      employmentIds: [53],
    }]);
  });

  test("aggregates duplicate Open relationships and multiple Open Primary records", async () => {
    const verifier = createEmploymentVerifier({
      inventory: {
        readAll: async () => [
          employment({ id: 61, userId: 10, status: EmploymentStatus.Pause }),
          employment({ id: 60, userId: 10 }),
          employment({
            id: 63,
            userId: 11,
            positionId: 21,
            organizationId: 31,
            isPrimary: true,
            status: EmploymentStatus.Pause,
          }),
          employment({ id: 62, userId: 11, isPrimary: true }),
        ],
      },
      clock: { nowDate: () => NOW },
    });

    expect((await verifier.verify()).failures).toEqual([{
      code: "duplicate-open-employment",
      count: 2,
      employmentIds: [60, 61],
    }, {
      code: "multiple-open-primary-employments",
      count: 2,
      employmentIds: [62, 63],
    }]);
  });

  test("reports multiple independently knowable anomalies on the same Employment", async () => {
    const verifier = createEmploymentVerifier({
      inventory: {
        readAll: async () => [employment({
          id: 70,
          status: 99,
          endTime: new Date("2026-08-01T00:00:00.000Z"),
        })],
      },
      clock: { nowDate: () => NOW },
    });

    const report = await verifier.verify();
    expect(report.counts.blockingEmployments).toBe(1);
    expect(report.failures).toEqual([{
      code: "unknown-employment-status",
      count: 1,
      employmentIds: [70],
    }, {
      code: "invalid-employment-period",
      count: 1,
      employmentIds: [70],
    }]);
  });

  test("accepts the start boundary, ended history and tombstones without guessing an end time", async () => {
    const verifier = createEmploymentVerifier({
      inventory: {
        readAll: async () => [
          employment({ id: 1, startTime: NOW }),
          employment({ id: 2, status: EmploymentStatus.Disable, endTime: NOW }),
          employment({ id: 3, isDelete: true, status: 99, positionStatus: null }),
        ],
      },
      clock: { nowDate: () => NOW },
    });
    const report = await verifier.verify();
    expect(report).toMatchObject({
      status: "passed",
      counts: { employments: 3, legacyTombstones: 1, blockingEmployments: 0 },
      failures: [],
    });
  });
});

function employment(
  overrides: Partial<EmploymentInventoryRow> = {},
): EmploymentInventoryRow {
  return {
    id: 1,
    userId: 10,
    positionId: 20,
    organizationId: 30,
    isPrimary: false,
    status: EmploymentStatus.Enable,
    startTime: new Date("2026-08-01T00:00:00.000Z"),
    endTime: null,
    isDelete: false,
    positionStatus: PositionStatus.Enable,
    positionDeleted: false,
    organizationStatus: OrganizationStatus.Enable,
    organizationDeleted: false,
    ...overrides,
  };
}
