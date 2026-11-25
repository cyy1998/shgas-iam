import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";

export class InvalidLoginCredentialError extends CustomError {
  constructor(message: string = "登录凭证无效") {
    super(message, {
      code: ApiErrorCode.InvalidLoginCredential,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidLoginCredentialError";
  }
}
