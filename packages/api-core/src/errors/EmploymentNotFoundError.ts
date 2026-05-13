import { CustomError } from "./CustomError";

export class EmploymentNotFoundError extends CustomError {
  constructor(message: string = "雇佣关系不存在") {
    super(message, 404);
    this.name = "EmploymentNotFoundError";
  }
}
