import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ApiErrorCode } from "@iam/contracts";
import { userDocuments } from "@iam/db/schema";
import { publication } from "../../src/__tests__/document-fixture";
import { createInternalUserDocumentQueryRepository } from "../../src/query/internal-user-query.repository";
import { createInternalUserDocumentQueryService } from "../../src/query/internal-user-query.service";
import { createUserDocumentQueryRepository } from "../../src/query/user-document-query.repository";
import { createUserDocumentQueryService } from "../../src/query/user-document-query.service";
import type { PostgresTestHarness } from "../support/postgres-test-harness";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const now = new Date("2026-08-22T12:00:00.000Z");
let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
});

describe("Internal User Document Detail", () => {
  test("login and contact reads consume their published scalar facts without parsing the legacy Detail", async () => {
    await harness!.db.insert(userDocuments).values([
      {
        ...profile(1, 1),
        document: {
          ...publication().document,
          mobile: "13800000000",
          employments: "broken unrelated association",
        },
      },
      profile(2, 0),
    ]);
    const service = createUserDocumentQueryService({
      documentRepository: createUserDocumentQueryRepository(harness!.db),
    });
    const login = await service.getLoginProfileByUserId(1);
    const mobile = await service.getMobileByUsername("user-1");
    const fullDocumentError = await createInternalUserDocumentQueryService({
      documentRepository: createInternalUserDocumentQueryRepository(harness!.db),
    })
      .getDetailByUsername("user-1", "internal")
      .catch((error) => error);
    const oldSchemaError = await service.getLoginProfileByUserId(2).catch((error) => error);
    expect(login).toEqual({ username: "user-1", name: "User 1", mobile: "13800000000" });
    expect(mobile).toBe("13800000000");
    expect(fullDocumentError).toMatchObject({ httpStatus: 503 });
    expect(oldSchemaError).toMatchObject({ code: ApiErrorCode.UserNotFound, httpStatus: 404 });
  });

  test("narrow reads preserve null mobile and reject an absent necessary mobile field", async () => {
    await harness!.db.insert(userDocuments).values(profile(1, 1));
    const service = createUserDocumentQueryService({
      documentRepository: createUserDocumentQueryRepository(harness!.db),
    });
    const mobile = await service.getMobileByUsername("user-1");
    expect(mobile).toBeNull();
    await harness!.sql`UPDATE user_document SET document=document #- '{mobile}' WHERE user_id=1`;
    const loginFailure = await service.getLoginProfileByUserId(1).catch((error) => error);
    const mobileFailure = await service.getMobileByUsername("user-1").catch((error) => error);
    expect(loginFailure).toBeInstanceOf(Error);
    expect(mobileFailure).toBeInstanceOf(Error);
  });

  test("reads only the strict v4 Detail by username", async () => {
    await harness!.db.insert(userDocuments).values([profile(1, 1), profile(2, 0)]);
    const service = createInternalUserDocumentQueryService({
      documentRepository: createInternalUserDocumentQueryRepository(harness!.db),
    });

    const current = await service.getDetailByUsername("user-1", "internal");
    const staleError = await service.getDetailByUsername("user-2", "internal").catch((error) => error);

    expect(current).toMatchObject({ username: "user-1", employments: [] });
    expect(staleError).toMatchObject({
      code: ApiErrorCode.UserNotFound,
      httpStatus: 404,
    });
  });
});

function profile(userId: number, schemaVersion: number) {
  return { ...publication(userId), schemaVersion };
}
