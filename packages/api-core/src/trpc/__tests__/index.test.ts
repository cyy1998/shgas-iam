import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "bun:test";
import { NOT_FOUND } from "../../core/http-status-codes";
import { CustomError } from "../../errors/CustomError";
import { mapCustomErrorToTRPCError } from "../index";

describe("mapCustomErrorToTRPCError", () => {
  test("maps transport status from CustomError.httpStatus and preserves business code on cause", () => {
    const err = new CustomError("组织不存在", {
      code: ApiErrorCode.OrganizationNotFound,
      httpStatus: NOT_FOUND,
      legacyCode: ServiceStatusCode.NotFound,
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
});
