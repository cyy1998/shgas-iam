import { describe, expect, test } from "bun:test";
import { collectUserProfileBusinessBoundaryViolations as analyze } from "../user-profile-business-boundary";

function analyzeAll(sources: Record<string, string>) {
  return Object.entries(sources)
    .flatMap(([file, source]) => analyze(file, source));
}

describe("User Profile business boundary analyzer", () => {
  test("allows repository-conventional named query, contracts, and local imports", () => {
    const violations = [
      analyze("/repo/apps/api/src/services/user-profile.ts", `
        import type {
          UserProfileQueryService,
        } from "@iam/user-profile-read-model/query";
        import {
          UserQueryDtoSchema,
        } from "@iam/user-profile-read-model/query";
        import type { RoleStatus } from "@iam/contracts";
        export { ApiErrorCode } from "@iam/contracts";
        export type { RoleStatus as CurrentRoleStatus } from "@iam/contracts";
      `),
      analyze("/repo/apps/api/src/services/relative-query.ts", `
        import type {
          UserProfileQueryService,
        } from "../../../../packages/user-profile-read-model/src/query.ts";
      `),
      analyze("/repo/apps/api/src/services/local.ts", `
        import type { LocalPort } from "./local.port";
        export type { LocalDto } from "../dto/local";
      `),
      analyze("/repo/packages/user-profile-read-model/src/worker.ts", `
        import type { UserProfileDirtyRepository } from "./dirty.repository";
      `),
    ].flat();

    expect(violations).toEqual([]);
  });

  test("rejects forbidden static named and type imports or re-exports", () => {
    const violations = analyzeAll({
      "contracts-dirty-reason.ts": `
        import type {
          UserProfileDirtyReason as DirtyReason,
        } from "@iam/contracts";
      `,
      "contracts-scope-reexport.ts": `
        export type { UserProfileScopeType } from "@iam/contracts";
      `,
      "producer.ts": `
        import {
          createUserProfileJobProducer,
        } from "@iam/user-profile-read-model/producer";
      `,
      "/repo/apps/api/src/services/user.ts": `
        import type {
          UserProfileDirtyRepository,
        } from "../../../../packages/user-profile-read-model/src/dirty.repository";
      `,
      "/repo/apps/admin-api/src/services/role.ts": `
        export {
          createUserProfileAffectedUserRepository,
        } from "../../../../packages/user-profile-read-model/src/affected-user.repository.ts";
      `,
    });

    expect(violations).toEqual([
      "contracts-dirty-reason.ts: uses forbidden identifier UserProfileDirtyReason",
      "contracts-scope-reexport.ts: uses forbidden identifier UserProfileScopeType",
      "producer.ts: imports forbidden User Profile module @iam/user-profile-read-model/producer; "
      + "uses forbidden identifier createUserProfileJobProducer",
      "/repo/apps/api/src/services/user.ts: imports forbidden User Profile module "
      + "../../../../packages/user-profile-read-model/src/dirty.repository; "
      + "uses forbidden identifier UserProfileDirtyRepository",
      "/repo/apps/admin-api/src/services/role.ts: re-exports forbidden User Profile module "
      + "../../../../packages/user-profile-read-model/src/affected-user.repository.ts; "
      + "uses forbidden identifier createUserProfileAffectedUserRepository",
    ]);
  });

  test("canonicalizes repository-conventional Windows cross-package paths", () => {
    const violations = analyze(
      "C:\\repo\\apps\\admin-api\\src\\services\\role.ts",
      String.raw`
        import type {
          UserProfileDirtyRepository,
        } from "..\\..\\..\\..\\packages\\user-profile-read-model\\src\\dirty.repository.ts";
      `,
    );

    expect(violations).toEqual([
      "C:\\repo\\apps\\admin-api\\src\\services\\role.ts: imports forbidden User Profile module "
      + "..\\..\\..\\..\\packages\\user-profile-read-model\\src\\dirty.repository.ts; "
      + "uses forbidden identifier UserProfileDirtyRepository",
    ]);
  });

  test("rejects direct legacy projection identifiers", () => {
    const violations = analyze("legacy.ts", `
      declare const userProfileDirtyMarker: {
        markUsersDirty: () => void;
      };
      declare function createUserProfileDirtyRepository(): unknown;
      declare function createUserProfileAffectedUserRepository(): unknown;
      declare function createUserProfileJobProducer(): unknown;

      userProfileDirtyMarker.markUsersDirty();
      createUserProfileDirtyRepository();
      createUserProfileAffectedUserRepository();
      createUserProfileJobProducer();
    `);

    expect(violations).toEqual([
      "legacy.ts: uses forbidden identifier createUserProfileAffectedUserRepository; "
      + "uses forbidden identifier createUserProfileDirtyRepository; "
      + "uses forbidden identifier createUserProfileJobProducer; "
      + "uses forbidden identifier markUsersDirty; "
      + "uses forbidden identifier userProfileDirtyMarker",
    ]);
  });
});
