import { ApiErrorCode } from "@iam/contracts";
import { FORBIDDEN } from "@iam/contracts/http";
import { AuthzError } from "./AuthzError";

export class AuthzForbiddenError extends AuthzError {
  constructor(message: string = "无权访问") {
    super(message, ApiErrorCode.Forbidden, FORBIDDEN);
    this.name = "AuthzForbiddenError";
  }
}
