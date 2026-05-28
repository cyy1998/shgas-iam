import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { FORBIDDEN } from "../core/http-status-codes";
import { AuthzError } from "./AuthzError";

export class AuthzMaintenanceError extends AuthzError {
  constructor(message: string = "系统维护中") {
    super(message, ApiErrorCode.Maintenance, FORBIDDEN, ServiceStatusCode.Maintancing);
    this.name = "AuthzMaintenanceError";
  }
}
