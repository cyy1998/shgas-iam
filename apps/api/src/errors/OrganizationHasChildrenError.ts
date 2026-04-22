import { CustomError } from "./CustomError";

export class OrganizationHasChildrenError extends CustomError {
  constructor(message: string = "该组织下存在子组织，无法删除") {
    super(message, 409);
    this.name = "OrganizationHasChildrenError";
  }
}
