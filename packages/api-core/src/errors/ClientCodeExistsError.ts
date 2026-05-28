import { ApiErrorCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class ClientCodeExistsError extends CustomError {
  constructor(message: string = "客户端编码已存在") {
    super(message, {
      code: ApiErrorCode.ClientCodeExists,
      httpStatus: CONFLICT,
    });
    this.name = "ClientCodeExistsError";
  }
}
