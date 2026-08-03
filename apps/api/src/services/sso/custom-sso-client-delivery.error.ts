import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";

export class CustomSsoClientDeliveryUnauthorizedError
  extends AuthzUnauthorizedError {
  constructor() {
    super("未登录");
    this.name = "CustomSsoClientDeliveryUnauthorizedError";
  }
}
