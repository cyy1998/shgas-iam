import { ApiErrorCode } from "@iam/contracts";
import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "bun:test";
import { BAD_REQUEST, NOT_FOUND } from "../../src/core/http-status-codes";
import { BadRequestError } from "../../src/errors/BadRequestError";
import { CustomError } from "../../src/errors/CustomError";
import { getApiRuntimeErrorFormatterData, mapCustomErrorToTRPCError } from "../../src/trpc";

class DomainLikeBusinessError extends Error {
  public code = ApiErrorCode.OrganizationNotFound;
  public httpStatus = NOT_FOUND;

  constructor() {
    super("组织不存在");
    this.name = "OrganizationNotFoundError";
  }
}

describe("mapCustomErrorToTRPCError", () => {
  test("maps transport status from CustomError.httpStatus and preserves business code on cause", () => {
    const err = new CustomError("组织不存在", {
      code: ApiErrorCode.OrganizationNotFound,
      httpStatus: NOT_FOUND,
    });

    try {
      mapCustomErrorToTRPCError(err);
      throw new Error("expected TRPCError");
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("NOT_FOUND");
      expect((error as TRPCError).cause).toBe(err);
    }
  });

  test("maps domain business error shape and preserves formatter fields", () => {
    const err = new DomainLikeBusinessError();

    try {
      mapCustomErrorToTRPCError(err);
      throw new Error("expected TRPCError");
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("NOT_FOUND");
      expect((error as TRPCError).cause).toBe(err);
    }

    expect(getApiRuntimeErrorFormatterData(err)).toEqual({
      serviceCode: ApiErrorCode.OrganizationNotFound,
      serviceMessage: "组织不存在",
      httpStatus: NOT_FOUND,
    });
  });

  test("maps bad requests to BAD_REQUEST", () => {
    const err = new CustomError("bad input", { httpStatus: BAD_REQUEST });

    try {
      mapCustomErrorToTRPCError(err);
      throw new Error("expected TRPCError");
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
      expect((error as TRPCError).cause).toBe(err);
    }
  });

  test("maps BadRequestError to BAD_REQUEST and formatter service fields", () => {
    const err = new BadRequestError("非法请求");

    try {
      mapCustomErrorToTRPCError(err);
      throw new Error("expected TRPCError");
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
      expect((error as TRPCError).cause).toBe(err);
    }

    expect(getApiRuntimeErrorFormatterData(err)).toEqual({
      serviceCode: ApiErrorCode.BadRequest,
      serviceMessage: "非法请求",
      httpStatus: BAD_REQUEST,
    });
  });

  test("leaves unknown errors untouched and out of formatter data", () => {
    const err = new Error("boom");

    expect(() => mapCustomErrorToTRPCError(err)).toThrow(err);
    expect(getApiRuntimeErrorFormatterData(err)).toBeNull();
  });
});
