import type { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from "@iam/contracts/http";

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
  BadRequest: BAD_REQUEST,
  NotFound: NOT_FOUND,
  Conflict: CONFLICT,
} as const;
