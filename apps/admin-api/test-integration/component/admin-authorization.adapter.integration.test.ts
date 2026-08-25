import type { Context } from "hono";
import { createAdminAuthorizationAdapter } from "@admin-api/routes/admin/authorization/authorization.adapter";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { ADMIN_MODULE_CODES } from "@iam/contracts";
import { expect, mock, test } from "bun:test";

function createContext(roles: string[]) {
  const policy = createAdminAuthorizationPolicy({
    hrAdministrationScopeResolver: {
      resolveForActor: async () => roles.includes("iam:hr-admin")
        ? { rootOrganizationIds: [10], organizationIds: [10] }
        : null,
    },
    logger: { warn: mock() },
  });
  return {
    get(key: string) {
      if (key === "adminAuthorizationPolicy")
        return policy;
      if (key === "userId")
        return 7;
      if (key === "username")
        return "operator";
      if (key === "userDetailDto")
        return { roles };
      return undefined;
    },
    req: { valid: () => ({}) },
    json: mock((body: unknown) => body),
  } as unknown as Context;
}

test("publishes the same Admin Capability Summary through REST and tRPC", async () => {
  const adapter = createAdminAuthorizationAdapter();
  const restContext = createContext(["iam:admin"]);

  const restResult = await adapter.capabilitySummary(
    restContext as never,
    async () => {},
  );
  const trpcResult = await adapter.authorizationAdminRouter
    .createCaller({ hono: restContext })
    .capabilitySummary({});

  expect(restResult).toMatchObject({
    code: 200,
    data: { visibleModules: [...ADMIN_MODULE_CODES] },
  });
  expect(trpcResult.visibleModules).toEqual([...ADMIN_MODULE_CODES]);
});

test("denies the capability contract to a role with no Admin capability", async () => {
  const adapter = createAdminAuthorizationAdapter();
  const context = createContext(["iam:user"]);

  let failure: unknown;
  try {
    await adapter.authorizationAdminRouter
      .createCaller({ hono: context })
      .capabilitySummary({});
  }
  catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({ code: "FORBIDDEN" });
});

test("publishes the HR scoped Capability Summary through REST and tRPC", async () => {
  const adapter = createAdminAuthorizationAdapter();
  const context = createContext(["iam:hr-admin"]);

  const restResult = await adapter.capabilitySummary(
    context as never,
    async () => {},
  );
  const trpcResult = await adapter.authorizationAdminRouter
    .createCaller({ hono: context })
    .capabilitySummary({});

  expect(restResult).toMatchObject({
    code: 200,
    data: {
      visibleModules: [
        "user",
        "organization",
        "organizationResponsibility",
        "position",
        "employment",
      ],
    },
  });
  expect(trpcResult.visibleModules).toEqual([
    "user",
    "organization",
    "organizationResponsibility",
    "position",
    "employment",
  ]);
  expect(trpcResult.collectionActions.organizationResponsibility.create).toEqual({
    allowed: true,
    reason: null,
  });
  expect(trpcResult.collectionActions.employment.create).toEqual({
    allowed: true,
    reason: null,
  });
  expect(trpcResult.collectionActions.organization.createRoot).toEqual({
    allowed: false,
    reason: "ACTION_NOT_GRANTED",
  });
  expect(trpcResult.collectionActions.position).toEqual({
    create: { allowed: false, reason: "ACTION_NOT_GRANTED" },
    edit: { allowed: false, reason: "ACTION_NOT_GRANTED" },
    changeStatus: { allowed: false, reason: "ACTION_NOT_GRANTED" },
    delete: { allowed: false, reason: "ACTION_NOT_GRANTED" },
  });
});
