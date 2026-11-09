import { ApiErrorCode } from "@iam/contracts";
import { UNAUTHORIZED } from "@iam/contracts/http";
import { AuthzError } from "./AuthzError";

export class AuthzUnauthorizedError extends AuthzError {
  constructor(message: string = "未登录或登录已过期") {
    super(message, ApiErrorCode.Unauthorized, UNAUTHORIZED);
    this.name = "AuthzUnauthorizedError";
  }
}
