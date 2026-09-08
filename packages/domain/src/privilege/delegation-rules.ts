import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export function validatePrivilegeDelegationCandidate(candidate: {
  delegatorUserId: number;
  delegateeUserId: number;
  startTime: Date;
  endTime: Date;
}) {
  if (candidate.delegatorUserId === candidate.delegateeUserId) {
    throw new DomainBusinessError("不允许自委托", {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
  if (!(candidate.startTime.getTime() < candidate.endTime.getTime())) {
    throw new DomainBusinessError("授权开始时间必须早于结束时间", {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}
