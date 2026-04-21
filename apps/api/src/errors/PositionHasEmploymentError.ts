import { CustomError } from "./CustomError";

export class PositionHasEmploymentError extends CustomError {
  constructor(message: string = "该岗位下存在雇佣关系，无法删除") {
    super(message, 409);
    this.name = "PositionHasEmploymentError";
  }
}
