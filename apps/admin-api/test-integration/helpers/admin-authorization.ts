import type { Hono } from "hono";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { mock } from "bun:test";

export const testAdminAuthorizationPolicy = createAdminAuthorizationPolicy({
  hrAdministrationScopeResolver: {
    resolveForActor: async () => null,
  },
  logger: { warn: mock() },
});

export function getTestAdminAuthorizationValue(key: string) {
  if (key === "adminAuthorizationPolicy")
    return testAdminAuthorizationPolicy;
  if (key === "userDetailDto")
    return { name: "Test Admin", roles: ["iam:admin"] };
  return undefined;
}

export function addTestAdminAuthorizationMiddleware(
  app: Hono,
  roles: string[] = ["iam:admin"],
) {
  app.use("*", async (c, next) => {
    c.set("adminAuthorizationPolicy" as never, testAdminAuthorizationPolicy as never);
    c.set("userId" as never, (c.get("userId" as never) ?? 1) as never);
    c.set("username" as never, (c.get("username" as never) ?? "admin") as never);
    const user = c.get("userDetailDto" as never) as Record<string, unknown> | undefined;
    c.set("userDetailDto" as never, { ...user, roles } as never);
    await next();
  });
}
