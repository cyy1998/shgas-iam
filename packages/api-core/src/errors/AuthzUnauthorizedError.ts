import { ServiceStatusCode } from "@iam/contracts";
import { HttpStatusCode } from "../http/status";
import { AuthzError } from "./AuthzError";

export class AuthzUnauthorizedError extends AuthzError {
  constructor(message: string) {
    super(message);
    this.name = "AuthzUnauthorizedError";
    this.code = ServiceStatusCode.Unauthorized;
    this.httpCode = HttpStatusCode.Unauthorized;
  }
}
