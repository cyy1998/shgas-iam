import { CustomError } from "./CustomError";

export class UserHasActiveEmploymentError extends CustomError {
  constructor(message: string = "该用户仍存在活跃雇佣，无法删除") {
    super(message, 409);
    this.name = "UserHasActiveEmploymentError";
  }
}
