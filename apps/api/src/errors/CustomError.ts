import { ServiceStatusCode } from "@enums/service.status";

export class CustomError extends Error {
  public code: number;
  constructor(message: string, code: number = ServiceStatusCode.Failure) {
    super(message);
    this.name = "CustomError"; // 设置错误名称
    this.code = code;
  }
}
