import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import * as resp from "../response";

describe("response helpers", () => {
  test("fail preserves existing two-argument behavior", () => {
    expect(resp.fail(ApiErrorCode.BadRequest, "请求失败")).toEqual({
      code: ApiErrorCode.BadRequest,
      data: null,
      message: "请求失败",
    });
  });

  test("fail supports diagnostic data", () => {
    expect(resp.fail(ApiErrorCode.ValidationFailed, "请求参数不合法", {
      requestId: "req-1",
      issues: [],
    })).toEqual({
      code: ApiErrorCode.ValidationFailed,
      data: {
        requestId: "req-1",
        issues: [],
      },
      message: "请求参数不合法",
    });
  });
});
