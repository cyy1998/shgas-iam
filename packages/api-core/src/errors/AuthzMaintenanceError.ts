import { ApiErrorCode } from "@iam/contracts";
import { SERVICE_UNAVAILABLE } from "../core/http-status-codes";
import { AuthzError } from "./AuthzError";

export class AuthzMaintenanceError extends AuthzError {
  constructor(message: string = "系统维护中") {
    super(message, ApiErrorCode.Maintenance, SERVICE_UNAVAILABLE);
    this.name = "AuthzMaintenanceError";
  }
}
