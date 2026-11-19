import { ApiErrorCode } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "@iam/contracts/http";
import { request, ServiceError } from "@sso/utils/request";
import { message } from "antd";

export async function submitSmsCode(path: string, body: { code: string }, getNewCode: string) {
  try {
    return await request<void>(path, {
      method: "POST",
      body: JSON.stringify(body),
      suppressErrorMessage: true,
    });
  } catch (error) {
    const failure =
      error instanceof ServiceError ? error : new ServiceError("提交结果暂时无法确认", ApiErrorCode.InternalError);
    if (failure.code === ApiErrorCode.InvalidVerificationCode) {
      message.error(`验证码无效，请检查输入，或${getNewCode}。`);
    } else if (failure.code === ApiErrorCode.InternalError || (failure.httpStatus ?? 0) >= INTERNAL_SERVER_ERROR) {
      message.error(`${failure.message}。请先确认变更是否已生效，如需重试，请${getNewCode}。`);
    } else {
      message.error(failure.message);
    }
    throw failure;
  }
}
