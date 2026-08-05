import { createLogoutSsoSessionUseCase } from "@api/use-cases/sso/logout-sso-session/logout-sso-session.use-case";
import { expect, mock, test } from "bun:test";

test("delegates the session token and returns the existing true result", async () => {
  const logout = mock(async () => ({ revoked: true }));
  const useCase = createLogoutSsoSessionUseCase({ sessions: { logout } });

  await expect(useCase.execute({ sessionToken: "principal-token" })).resolves.toBe(true);

  expect(logout).toHaveBeenCalledWith("principal-token");
});

test("propagates session logout failures", async () => {
  const useCase = createLogoutSsoSessionUseCase({
    sessions: { logout: mock(async () => { throw new Error("logout failed"); }) },
  });

  await expect(useCase.execute({ sessionToken: "principal-token" })).rejects.toThrow("logout failed");
});
