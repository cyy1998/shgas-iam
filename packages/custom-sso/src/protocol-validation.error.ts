import { AuthzUnauthorizedError } from "@iam/runtime/errors";

/** A valid object submitted outside its intended request must remain recoverable. */
export class CustomSsoRequestMismatchError extends AuthzUnauthorizedError {
  constructor() {
    super("未登录");
    this.name = "CustomSsoRequestMismatchError";
  }
}
