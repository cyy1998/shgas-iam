import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";

/** A valid object submitted outside its intended request must remain recoverable. */
export class CustomSsoRequestMismatchError extends AuthzUnauthorizedError {
  constructor() {
    super("未登录");
    this.name = "CustomSsoRequestMismatchError";
  }
}
