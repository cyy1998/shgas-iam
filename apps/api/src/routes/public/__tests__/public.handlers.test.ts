import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { ApiErrorCode } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPublicHandlers } from "../public.handlers";

const subjectIdentifier = "00000000-0000-4000-8000-000000001001";
const userDetail = { id: 1001, username: "138550", name: "测试用户" };
const getActiveUserBySubjectIdentifier = mock(async () => ({
  ...userDetail,
  subjectIdentifier,
}));
const getUserDetailById = mock(async () => userDetail);
const resolveUserInfoForRequest = mock(async () => ({
  version: 1 as const,
  subjectIdentifier,
  profile: {
    username: userDetail.username,
    name: userDetail.name,
  },
}));

function createHandlers() {
  return createPublicHandlers({
    config: {
      projectionRetryAfterSeconds: 3,
    },
    organizationService: {},
    subjectDeliveryRequests: {
      resolveUserInfoForRequest,
    },
    userService: {
      getActiveUserBySubjectIdentifier,
      getUserDetailById,
    },
  } as never);
}

function makeContext(orcasId: string | null | undefined) {
  return {
    get: mock((key: string) => {
      if (key === "orcasId")
        return orcasId;
      if (key === "subjectIdentifier")
        return subjectIdentifier;
      if (key === "authenticatedClientCode")
        return "gateway";
      return undefined;
    }),
    json: mock((body: unknown) => body),
  };
}

beforeEach(() => {
  getActiveUserBySubjectIdentifier.mockClear();
  getUserDetailById.mockClear();
  resolveUserInfoForRequest.mockClear();
  resolveUserInfoForRequest.mockImplementation(async () => ({
    version: 1 as const,
    subjectIdentifier,
    profile: {
      username: userDetail.username,
      name: userDetail.name,
    },
  }));
});

describe("createPublicHandlers", () => {
  test("userInfo returns the live client-scoped projection without resolving a legacy account", async () => {
    const handlers = createHandlers();
    const context = makeContext(undefined);

    const result: unknown = await handlers.userInfo(context as never, undefined as never);

    const projection = {
      version: 1,
      subjectIdentifier,
      profile: {
        username: userDetail.username,
        name: userDetail.name,
      },
    };
    expect(result).toEqual(resp.ok(projection));
    expect(context.json).toHaveBeenCalledWith(
      resp.ok(projection),
      HttpStatusCodes.OK,
    );
    expect(resolveUserInfoForRequest).toHaveBeenCalledWith(context);
    expect(context.get).not.toHaveBeenCalled();
    expect(getActiveUserBySubjectIdentifier).not.toHaveBeenCalled();
    expect(getUserDetailById).not.toHaveBeenCalled();
  });

  test("userInfo maps Projection Not Ready to a sanitized retryable error", async () => {
    const handlers = createHandlers();
    const context = makeContext(undefined);
    resolveUserInfoForRequest.mockRejectedValueOnce(
      new SubjectProjectionNotReadyError(),
    );

    await expect(
      handlers.userInfo(context as never, undefined as never),
    ).rejects.toMatchObject({
      code: ApiErrorCode.SubjectProjectionNotReady,
      httpStatus: HttpStatusCodes.SERVICE_UNAVAILABLE,
      retryAfterSeconds: 3,
    });
    expect(getActiveUserBySubjectIdentifier).not.toHaveBeenCalled();
    expect(getUserDetailById).not.toHaveBeenCalled();
  });

  test("orcasId returns the Custom SSO session Orcas ID", async () => {
    const handlers = createHandlers();
    const context = makeContext("orcas-user-1");

    const result: unknown = await handlers.orcasId(context as never, undefined as never);

    expect(result).toEqual(resp.ok({ orcasId: "orcas-user-1" }));
    expect(context.json).toHaveBeenCalledWith(resp.ok({ orcasId: "orcas-user-1" }), HttpStatusCodes.OK);
  });

  test("orcasId returns null when the session has no Orcas ID", async () => {
    const handlers = createHandlers();
    const context = makeContext(undefined);

    const result: unknown = await handlers.orcasId(context as never, undefined as never);

    expect(result).toEqual(resp.ok({ orcasId: null }));
    expect(context.json).toHaveBeenCalledWith(resp.ok({ orcasId: null }), HttpStatusCodes.OK);
  });
});
