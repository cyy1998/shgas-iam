import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { FORBIDDEN } from "../core/http-status-codes";
import { AuthzError } from "./AuthzError";

export class AuthzForbiddenError extends AuthzError {
  constructor(message: string = "无权访问") {
    super(message, ApiErrorCode.Forbidden, FORBIDDEN, ServiceStatusCode.Forbidden);
    this.name = "AuthzForbiddenError";
  }
}
