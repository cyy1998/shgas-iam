import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";

export class InvalidRedirectUriError extends CustomError {
  constructor(message: string = "非法重定向地址") {
    super(message, {
      code: ApiErrorCode.InvalidRedirectUri,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidRedirectUriError";
  }
}

export class InvalidSsoClientError extends CustomError {
  constructor(message: string = "非法Client") {
    super(message, {
      code: ApiErrorCode.InvalidSsoClient,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidSsoClientError";
  }
}
