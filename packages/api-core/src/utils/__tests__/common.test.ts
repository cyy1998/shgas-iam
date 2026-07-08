import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { BAD_REQUEST } from "../../core/http-status-codes";
import { getProtocolAndHost } from "../common";

describe("getProtocolAndHost", () => {
  test("rejects invalid URLs as bad requests", () => {
    expect(() => getProtocolAndHost("not a url")).toThrow(
      expect.objectContaining({
        code: ApiErrorCode.BadRequest,
        httpStatus: BAD_REQUEST,
        message: "Invalid URL: not a url",
      }),
    );
  });
});
