import { expect, mock, test } from "bun:test";
import { publication } from "../../__tests__/document-fixture";
import { createInternalUserDocumentQueryService } from "../internal-user-query.service";

test("maps Internal Detail database failures to a sanitized unavailable error", async () => {
  const service = createInternalUserDocumentQueryService({
    documentRepository: {
      getCurrentByUsername: mock(async () => {
        throw new Error("database DSN must not escape");
      }),
    },
  });

  const error = await service.getDetailByUsername("alice", "internal").catch((error) => error);

  expect(error).toMatchObject({
    code: "USER_SEARCH_UNAVAILABLE",
    httpStatus: 503,
    message: "用户搜索暂时不可用",
  });
});

test("fails closed when the published current Detail is malformed", async () => {
  const service = createInternalUserDocumentQueryService({
    documentRepository: {
      getCurrentByUsername: mock(async () => ({ ...publication(), document: { invalid: true } })),
    },
  });

  const error = await service.getDetailByUsername("alice", "internal").catch((error) => error);

  expect(error).toMatchObject({
    message: "已发布的 User Document Detail 不符合严格契约",
    code: "USER_SEARCH_UNAVAILABLE",
    httpStatus: 503,
  });
});
