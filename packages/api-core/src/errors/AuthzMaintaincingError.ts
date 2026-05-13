import { ServiceStatusCode } from "@iam/contracts";
import { HttpStatusCode } from "../http/status";
import { AuthzError } from "./AuthzError";

export class AuthzMaintaincingError extends AuthzError {
  constructor(message: string) {
    super(message);
    this.name = "AuthzMaintaincingError";
    this.code = ServiceStatusCode.Maintancing;
    this.httpCode = HttpStatusCode.Forbidden;
  }
}
