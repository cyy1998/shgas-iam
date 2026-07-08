import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { BAD_REQUEST } from "../../core/http-status-codes";
import { BadRequestError } from "../BadRequestError";
import { CustomError } from "../CustomError";

describe("BadRequestError", () => {
  test("uses generic bad request API runtime shape", () => {
    const error = new BadRequestError();

    expect(error).toBeInstanceOf(CustomError);
    expect(error.name).toBe("BadRequestError");
    expect(error.message).toBe("请求参数错误");
    expect(error.code).toBe(ApiErrorCode.BadRequest);
    expect(error.httpStatus).toBe(BAD_REQUEST);
  });

  test("preserves custom message with bad request code and status", () => {
    const error = new BadRequestError("非法请求");

    expect(error.message).toBe("非法请求");
    expect(error.code).toBe(ApiErrorCode.BadRequest);
    expect(error.httpStatus).toBe(BAD_REQUEST);
  });
});
