import { ApiErrorCode } from "@iam/contracts";
import { BAD_GATEWAY } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class OrcasLoginFailedError extends CustomError {
  constructor(message: string = "Orcas登录失败") {
    super(message, {
      code: ApiErrorCode.OrcasLoginFailed,
      httpStatus: BAD_GATEWAY,
    });
    this.name = "OrcasLoginFailedError";
  }
}
