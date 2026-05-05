import { HttpStatusCode } from "@api/enums/http.status";
import { ServiceStatusCode } from "@api/enums/service.status";
import { AuthzError } from "./AuthzError";

export class AuthzMaintaincingError extends AuthzError {
  constructor(message: string) {
    super(message);
    this.name = "AuthzMaintaincingError";
    this.code = ServiceStatusCode.Maintancing;
    this.httpCode = HttpStatusCode.Forbidden;
  }
}
