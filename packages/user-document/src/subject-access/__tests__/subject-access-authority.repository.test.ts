import { describe, expect, mock, test } from "bun:test";
import { UserDocumentWorkStatus, UserStatus } from "@iam/contracts";
import { factsRecord, publication } from "../../__tests__/document-fixture";
import { createSubjectAccessAuthorityRepository } from "../subject-access-authority.repository";

const subjectIdentifier = publication().subjectIdentifier;

describe("Subject Access authority repository", () => {
  test("publishes one narrow current Document row before reporting enabled/current", async () => {
    const { db, select, limit } = createDb([authorityRow()]);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db,
      subjectFactsPublisher: { publish },
    });

    await expect(authority.resolve(subjectIdentifier)).resolves.toEqual({
      accountState: "enabled",
      factsState: "current",
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
    expect(publish).toHaveBeenCalledWith(factsRecord(1, "7"));
  });

  test.each([
    ["document missing", { ...authorityRow(), subjectIdentifier: null }],
    ["Dirty pending", { ...authorityRow(), rebuildStatus: UserDocumentWorkStatus.Pending }],
    ["version mismatch", { ...authorityRow(), requiredVersion: "8" }],
    ["Facts invalid", { ...authorityRow(), document: { employments: "legacy" } }],
    ["direct source work not expanded", { ...authorityRow(), sourcePending: true }],
  ])("keeps an enabled account not-current when %s", async (_, row) => {
    const { db } = createDb([row]);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db,
      subjectFactsPublisher: { publish },
    });

    await expect(authority.resolve(subjectIdentifier)).resolves.toEqual({
      accountState: "enabled",
      factsState: "not_current",
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test("retained higher cache version cannot restore current authority", async () => {
    const { db } = createDb([authorityRow()]);
    const authority = createSubjectAccessAuthorityRepository({
      db,
      subjectFactsPublisher: { publish: mock(async () => ({ status: "retained-newer" as const })) },
    });
    const result = await authority.resolve(subjectIdentifier);
    expect(result).toEqual({ accountState: "enabled", factsState: "not_current" });
  });

  test.each([
    ["disabled", { ...authorityRow(), accountStatus: UserStatus.Disable }],
    ["deleted", { ...authorityRow(), accountDeleted: true }],
    ["missing", undefined],
  ])("reports %s accounts disabled without reading or publishing Facts", async (_, row) => {
    const { db } = createDb(row === undefined ? [] : [row]);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db,
      subjectFactsPublisher: { publish },
    });

    await expect(authority.resolve(subjectIdentifier)).resolves.toEqual({
      accountState: "disabled",
      factsState: "not_current",
    });
    expect(publish).not.toHaveBeenCalled();
  });
});

function createDb(rows: unknown[]) {
  const limit = mock(async () => rows);
  const where = mock(() => ({ limit }));
  const secondLeftJoin = mock((_table: unknown) => {
    return { where };
  });
  const firstLeftJoin = mock((_table: unknown) => {
    return { leftJoin: secondLeftJoin };
  });
  const from = mock((_table: unknown) => {
    return { leftJoin: firstLeftJoin };
  });
  const select = mock((_columns: Record<string, unknown>) => {
    return { from };
  });
  return {
    db: { select } as never,
    select,
    limit,
  };
}

function authorityRow() {
  return {
    ...publication(1, "7"),
    accountStatus: UserStatus.Enable,
    accountDeleted: false,
    requiredVersion: "7",
    rebuildStatus: UserDocumentWorkStatus.Processed,
    sourcePending: false,
  };
}
