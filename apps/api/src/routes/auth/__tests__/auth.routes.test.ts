import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { capChallenge } from "../../open/open.routes";
import { callback } from "../../sso/sso.routes";
import { internalAuthz, loginPassword } from "../auth.routes";

const loginPasswordSchema = loginPassword.request.body.content["application/json"].schema;
const internalAuthzSuccessSchema = internalAuthz.responses[200].content["application/json"].schema;

type SchemaLike = {
  safeParse: (input: unknown) => { success: boolean };
};

function getJsonSchema(route: { responses: Record<number, unknown> }, status: number): SchemaLike {
  const response = route.responses[status] as {
    content?: {
      "application/json"?: {
        schema?: SchemaLike;
      };
    };
  };
  const schema = response.content?.["application/json"]?.schema;

  if (!schema)
    throw new Error(`Missing JSON schema for status ${status}`);

  return schema;
}

function expectCommonErrorResponses(route: { responses: Record<number, unknown> }) {
  const statuses = [
    HttpStatusCodes.BAD_REQUEST,
    HttpStatusCodes.UNAUTHORIZED,
    HttpStatusCodes.FORBIDDEN,
    HttpStatusCodes.NOT_FOUND,
    HttpStatusCodes.CONFLICT,
    HttpStatusCodes.UNPROCESSABLE_ENTITY,
    HttpStatusCodes.INTERNAL_SERVER_ERROR,
  ];

  for (const status of statuses) {
    expect(route.responses[status]).toBeDefined();
  }

  expect(getJsonSchema(route, HttpStatusCodes.BAD_REQUEST).safeParse({
    code: ApiErrorCode.BadRequest,
    data: null,
    message: "请求参数错误",
  }).success).toBe(true);
  expect(getJsonSchema(route, HttpStatusCodes.UNPROCESSABLE_ENTITY).safeParse({
    code: ApiErrorCode.ValidationFailed,
    data: {
      requestId: "req-1",
      issues: [{
        code: "invalid_type",
        path: ["name"],
        message: "Invalid input",
        extra: "preserved",
      }],
    },
    message: "请求参数不合法",
  }).success).toBe(true);
  expect(getJsonSchema(route, HttpStatusCodes.INTERNAL_SERVER_ERROR).safeParse({
    code: ApiErrorCode.InternalError,
    data: {
      requestId: "req-1",
    },
    message: "服务器内部错误，请联系管理员并提供 requestId",
  }).success).toBe(true);
}

describe("auth routes", () => {
  test("password login accepts encrypted credential payload", () => {
    expect(loginPasswordSchema.safeParse({
      credential: "iam-login-v1.payload",
      capToken: "cap-token",
    }).success).toBe(true);
  });

  test("password login rejects legacy plaintext payload", () => {
    expect(loginPasswordSchema.safeParse({
      username: "138550",
      password: "1234",
    }).success).toBe(false);
  });

  test("internal authz success response carries boolean data", () => {
    expect(internalAuthzSuccessSchema.safeParse({
      code: 200,
      data: true,
      message: "success",
    }).success).toBe(true);

    expect(internalAuthzSuccessSchema.safeParse({
      code: 200,
      data: {},
      message: "success",
    }).success).toBe(false);
  });

  test("normal JSON route documents common error responses", () => {
    expectCommonErrorResponses(loginPassword);
  });

  test("SSO redirect route preserves redirect success and documents common errors", () => {
    expect(callback.responses[HttpStatusCodes.MOVED_TEMPORARILY]).toEqual({
      description: "本地会话回调成功",
    });
    expectCommonErrorResponses(callback);
  });

  test("CAP protocol route preserves non-envelope success and documents common errors", () => {
    const capChallengeSchema = getJsonSchema(capChallenge, HttpStatusCodes.OK);

    expect(capChallengeSchema.safeParse({
      challenge: {
        c: 1,
        s: 2,
        d: 3,
      },
      expires: 60,
    }).success).toBe(true);
    expect(capChallengeSchema.safeParse({
      code: 200,
      data: {},
      message: "success",
    }).success).toBe(false);
    expectCommonErrorResponses(capChallenge);
  });
});
