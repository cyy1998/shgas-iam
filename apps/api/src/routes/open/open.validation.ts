import { BadRequestError } from "@iam/api-core/errors/BadRequestError";

export function requirePhoneNumber(phoneNumber?: string): string {
  if (!phoneNumber) {
    throw new BadRequestError("手机号不能为空");
  }
  return phoneNumber;
}
