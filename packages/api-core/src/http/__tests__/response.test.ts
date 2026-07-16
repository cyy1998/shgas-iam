import type { ApiEnvelope } from "../response";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import * as resp from "../response";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsEqual<TActual, TExpected> = (
  <T>() => T extends TActual ? 1 : 2
) extends (
  <T>() => T extends TExpected ? 1 : 2
) ? true : false;
type Assert<T extends true> = T;
type AssertFalse<T extends false> = T;

const _typedSuccessEnvelope = resp.ok("user-info" as string);
const _typedNullSuccessEnvelope = resp.ok();
const _typedFailureEnvelope = resp.fail(
  ApiErrorCode.BadRequest,
  "请求失败",
  { requestId: "req-1" } as { requestId: string },
);

type _SuccessEnvelopeIsNotAny = AssertFalse<IsAny<typeof _typedSuccessEnvelope>>;
type _SuccessEnvelopePreservesData = Assert<IsEqual<typeof _typedSuccessEnvelope, ApiEnvelope<string, 200>>>;
type _NullSuccessEnvelopePreservesData = Assert<IsEqual<typeof _typedNullSuccessEnvelope["data"], null>>;
type _FailureEnvelopeIsNotAny = AssertFalse<IsAny<typeof _typedFailureEnvelope>>;
type _FailureEnvelopePreservesData = Assert<
  IsEqual<typeof _typedFailureEnvelope["data"], { requestId: string }>
>;
type _ApiEnvelopePreservesData = Assert<IsEqual<ApiEnvelope<{ id: string }>["data"], { id: string }>>;

describe("response helpers", () => {
  test("ok without data returns a success envelope with null data", () => {
    expect(resp.ok()).toEqual({
      code: 200,
      data: null,
      message: "success",
    });
  });

  test("ok preserves success data", () => {
    expect(resp.ok({ id: "u-1" })).toEqual({
      code: 200,
      data: {
        id: "u-1",
      },
      message: "success",
    });
  });

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
