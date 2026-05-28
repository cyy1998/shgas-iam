import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidHumanVerificationSiteError extends CustomError {
  constructor(message: string = "无效人机校验站点") {
    super(message, {
      code: ApiErrorCode.InvalidHumanVerificationSite,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidHumanVerificationSiteError";
  }
}
