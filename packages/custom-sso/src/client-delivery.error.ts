import { AuthzUnauthorizedError } from "@iam/runtime/errors";

export class CustomSsoClientDeliveryUnauthorizedError extends AuthzUnauthorizedError {
  constructor() {
    super("未登录");
    this.name = "CustomSsoClientDeliveryUnauthorizedError";
  }
}
