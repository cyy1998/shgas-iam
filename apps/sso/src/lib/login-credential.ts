import {
  createLoginCredential,
  LOGIN_CREDENTIAL_ALG as SUPPORTED_LOGIN_CREDENTIAL_ALG,
} from '@iam/contracts';
import {
  LOGIN_CREDENTIAL_ALG,
  LOGIN_CREDENTIAL_KID,
  LOGIN_CREDENTIAL_PUBLIC_KEY,
} from '@sso/constants/config';

type PasswordLoginCredentialInput = {
  username: string;
  password: string;
};

function assertLoginCredentialConfig() {
  if (
    !LOGIN_CREDENTIAL_KID ||
    !LOGIN_CREDENTIAL_PUBLIC_KEY ||
    LOGIN_CREDENTIAL_ALG !== SUPPORTED_LOGIN_CREDENTIAL_ALG
  ) {
    throw new Error('登录加密配置未就绪');
  }
}

export function createPasswordLoginCredential(
  input: PasswordLoginCredentialInput,
): string {
  assertLoginCredentialConfig();
  return createLoginCredential({
    username: input.username,
    password: input.password,
    kid: LOGIN_CREDENTIAL_KID,
    publicKey: LOGIN_CREDENTIAL_PUBLIC_KEY,
  });
}

