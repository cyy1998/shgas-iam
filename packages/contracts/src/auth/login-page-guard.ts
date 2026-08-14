export enum LoginPageGuardDecision {
  Continue = "continue",
  Login = "login",
}

export interface LoginPageGuardResult {
  decision: LoginPageGuardDecision;
}
