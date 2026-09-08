import type { CustomSso } from "@iam/custom-sso";
import { LoginPageGuardDecision } from "@iam/contracts";

export function createCheckSsoLoginContinuationUseCase(deps: Pick<CustomSso, "checkLoginContinuation">) {
  async function execute(input: Parameters<CustomSso["checkLoginContinuation"]["execute"]>[0]) {
    const session = await deps.checkLoginContinuation.execute(input);
    return {
      clearGlobalSessionCookie: session === "invalid",
      decision: session === "valid" ? LoginPageGuardDecision.Continue : LoginPageGuardDecision.Login,
    };
  }
  return { execute };
}
export type CheckSsoLoginContinuationUseCase = ReturnType<typeof createCheckSsoLoginContinuationUseCase>;
