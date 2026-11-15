import { createLoginCredential } from "@iam/contracts";
import { LOGIN_CREDENTIAL_KID, LOGIN_CREDENTIAL_PUBLIC_KEY } from "@sso/constants/config";

type PasswordLoginCredentialInput = {
  username: string;
  password: string;
  wechatQrRequestId?: string;
};

function assertLoginCredentialConfig() {
  if (!LOGIN_CREDENTIAL_KID || !LOGIN_CREDENTIAL_PUBLIC_KEY) {
    throw new Error("登录加密配置未就绪");
  }
}

export function createPasswordLoginCredential(input: PasswordLoginCredentialInput): string {
  assertLoginCredentialConfig();
  return createLoginCredential({
    username: input.username,
    password: input.password,
    ...(input.wechatQrRequestId !== undefined && { wechatQrRequestId: input.wechatQrRequestId }),
    kid: LOGIN_CREDENTIAL_KID,
    publicKey: LOGIN_CREDENTIAL_PUBLIC_KEY,
  });
}
