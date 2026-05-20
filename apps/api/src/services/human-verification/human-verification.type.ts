export enum HumanVerificationAction {
  SendSmsCode = "sendSmsCode",
  PasswordLogin = "passwordLogin",
  MobileLogin = "mobileLogin",
  OpenUserInfoLookup = "openUserInfoLookup",
}

export type HumanVerificationContext = {
  subject?: string;
  ip?: string;
  client?: string;
};
