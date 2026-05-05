import { HttpStatusCode } from "@api/enums/http.status";
import { ServiceStatusCode } from "@api/enums/service.status";
import { AuthzError } from "./AuthzError";

export class AuthzUnauthorizedError extends AuthzError {
  constructor(message: string) {
    super(message);
    this.name = "AuthzUnauthorizedError";
    this.code = ServiceStatusCode.Unauthorized;
    this.httpCode = HttpStatusCode.Unauthorized;
  }
}
