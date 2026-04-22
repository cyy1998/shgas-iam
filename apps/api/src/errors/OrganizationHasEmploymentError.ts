import { CustomError } from "./CustomError";

export class OrganizationHasEmploymentError extends CustomError {
  constructor(message: string = "该组织下存在雇佣关系，无法删除") {
    super(message, 409);
    this.name = "OrganizationHasEmploymentError";
  }
}
