import { CustomError } from "./CustomError";

export class EmploymentNotEditableError extends CustomError {
  constructor(message: string = "已结束的雇佣关系不能修改") {
    super(message, 409);
    this.name = "EmploymentNotEditableError";
  }
}
