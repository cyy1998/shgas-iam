import { CustomError } from "@iam/api-core/errors/CustomError";
import { ServiceStatusCode } from "@iam/contracts";

export class HumanVerificationRequiredError extends CustomError {
  constructor(message: string = "需要人机校验") {
    super(message, ServiceStatusCode.HumanVerificationRequired);
  }
}

export function isHumanVerificationRequiredError(error: unknown): boolean {
  return error instanceof HumanVerificationRequiredError
    || (error instanceof CustomError && error.code === ServiceStatusCode.HumanVerificationRequired);
}
