import { ApiErrorCode } from "@iam/contracts";
import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "bun:test";
import { BAD_REQUEST, NOT_FOUND } from "../../core/http-status-codes";
import { CustomError } from "../../errors/CustomError";
import { getApiRuntimeErrorFormatterData, mapCustomErrorToTRPCError } from "../index";

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

  test("leaves unknown errors untouched and out of formatter data", () => {
    const err = new Error("boom");

    expect(() => mapCustomErrorToTRPCError(err)).toThrow(err);
    expect(getApiRuntimeErrorFormatterData(err)).toBeNull();
  });
});
