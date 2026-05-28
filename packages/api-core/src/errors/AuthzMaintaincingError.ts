import { AuthzMaintenanceError } from "./AuthzMaintenanceError";

export class AuthzMaintaincingError extends AuthzMaintenanceError {
  constructor(message: string = "系统维护中") {
    super(message);
    this.name = "AuthzMaintaincingError";
  }
}
