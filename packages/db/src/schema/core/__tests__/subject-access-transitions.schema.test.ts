import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { subjectAccessTransitions } from "../subject-access-transitions";

describe("Subject Access transition recovery schema", () => {
  test("stores only durable recovery metadata before a user mutation starts", () => {
    const config = getTableConfig(subjectAccessTransitions);
    const columns = Object.fromEntries(
      config.columns.map(column => [column.name, column]),
    );

    expect(config.name).toBe("subject_access_transition");
    expect(Object.keys(columns)).toEqual([
      "id",
      "subject_identifier",
      "owner_token",
      "status",
      "target_state",
      "create_time",
      "update_time",
    ]);
    expect(columns.id).toMatchObject({
      columnType: "PgUUID",
      notNull: true,
      primary: true,
    });
    expect(columns.subject_identifier).toMatchObject({
      columnType: "PgUUID",
      notNull: true,
    });
    expect(columns.owner_token).toMatchObject({
      columnType: "PgUUID",
      notNull: true,
    });
    expect(columns.status).toMatchObject({ notNull: true, hasDefault: true });
    expect(columns.target_state!.notNull).toBe(false);
    expect(config.checks.map(check => check.name).sort()).toEqual([
      "subject_access_transition_state_check",
      "subject_access_transition_target_check",
    ]);
  });

  test("allows only one unresolved owner per subject", () => {
    const config = getTableConfig(subjectAccessTransitions);
    const pendingIndex = config.indexes.find(
      index => index.config.name === "subject_access_transition_pending_subject_idx",
    );

    expect(pendingIndex?.config.unique).toBe(true);
    expect(pendingIndex?.config.columns.map((column: any) => column.name)).toEqual([
      "subject_identifier",
    ]);
    expect(pendingIndex?.config.where).toBeDefined();
  });

  test("indexes stale unresolved owners in deterministic reap order", () => {
    const config = getTableConfig(subjectAccessTransitions);
    const pendingUpdateTimeIndex = config.indexes.find(
      index =>
        index.config.name
        === "subject_access_transition_pending_update_time_idx",
    );

    expect(pendingUpdateTimeIndex?.config.unique).toBe(false);
    expect(
      pendingUpdateTimeIndex?.config.columns.map((column: any) => column.name),
    ).toEqual([
      "update_time",
      "id",
    ]);
    expect(pendingUpdateTimeIndex?.config.where).toBeDefined();
  });
});
