import type { ApiErrorCode } from "@iam/contracts";

export interface DomainBusinessErrorOptions {
  code: ApiErrorCode | string;
  httpStatus: number;
}

export class DomainBusinessError extends Error {
  public code: ApiErrorCode | string;
  public httpStatus: number;

  constructor(message: string, options: DomainBusinessErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.httpStatus = options.httpStatus;
  }
}

export const DomainHttpStatus = {
  BadRequest: 400,
  NotFound: 404,
  Conflict: 409,
} as const;
