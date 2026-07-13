import type { LogoutSsoSessionDeps } from "./logout-sso-session.port";
import type { LogoutSsoSessionInput, LogoutSsoSessionResult } from "./logout-sso-session.type";

export function createLogoutSsoSessionUseCase(deps: LogoutSsoSessionDeps) {
  async function execute(input: LogoutSsoSessionInput): Promise<LogoutSsoSessionResult> {
    await deps.sessions.logout(input.sessionToken);
    return true;
  }

  return { execute };
}

export type LogoutSsoSessionUseCase = ReturnType<typeof createLogoutSsoSessionUseCase>;
