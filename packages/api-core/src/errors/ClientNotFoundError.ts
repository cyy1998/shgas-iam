import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class ClientNotFoundError extends CustomError {
  constructor(message: string = "客户端不存在") {
    super(message, {
      code: ApiErrorCode.ClientNotFound,
      httpStatus: NOT_FOUND,
      legacyCode: ServiceStatusCode.NotFound,
    });
    this.name = "ClientNotFoundError";
  }
}
