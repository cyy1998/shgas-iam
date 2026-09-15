import type { Context } from "hono";
import { createSessionManagementAdapter } from "@admin-api/routes/admin/session-management/session-management.adapter";
import { createAdminRouter } from "@admin-api/trpc/routers/admin";
import { createAppRouter } from "@admin-api/trpc/trpc.router";
import { router } from "@iam/api-core/trpc";
import { expect, test } from "bun:test";
import { getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

test("publishes all four login-state intents under admin.sessionManagement", async () => {
  const emptyRouter = router({});
  const sessionManagement = createSessionManagementAdapter({
    sessionManagementService: {
      listLoginRestrictions: async input => ({
        result: [],
        total: 0,
        pageNum: input.pageNum,
        pageSize: input.pageSize,
        pages: 0,
      }),
      listSessions: async input => ({
        result: [],
        total: 0,
        pageNum: input.pageNum,
        pageSize: input.pageSize,
        pages: 0,
      }),
      releaseLoginRestriction: async () => ({
        changed: false,
        result: {
          failureStateCleared: true,
        },
      }),
      revokeSessions: async input => ({
        changed: false,
        result: { scope: input.target.type === "user" ? "user" : "session", currentPrincipalSessionExcluded: input.target.type === "user" && input.target.userId === 7, sessions: { userSessionsTerminated: 0, clientSessionsTerminated: 0, excluded: 0, failed: 0, unknown: 0 }, generation: "unified" as const, batch: { results: [], unfinished: [] }, artifactCleanup: { attempted: 0, succeeded: 0, failed: 0 } },
      }),
    },
  }).sessionManagementAdminRouter;
  const appRouter = createAppRouter(createAdminRouter({
    clientSso: emptyRouter as never,
    audit: emptyRouter,
    client: emptyRouter,
    employment: emptyRouter,
    organization: emptyRouter,
    position: emptyRouter,
    role: emptyRouter,
    sessionManagement,
    user: emptyRouter,
  } as never));

  const caller = appRouter.createCaller({
    hono: {
      get(key: string) {
        const authorizationValue = getTestAdminAuthorizationValue(key);
        if (authorizationValue !== undefined)
          return authorizationValue;
        if (key === "userId")
          return 7;
        if (key === "username")
          return "root";
        if (key === "principalSessionId")
          return "ps-admin";
        return undefined;
      },
      req: {
        header: () => undefined,
        method: "POST",
        path: "/rpc/admin.sessionManagement.revokeSessions",
      },
    } as unknown as Context,
  });

  await expect(caller.admin.sessionManagement.listSessions({
    conditions: { userId: 42 },
  })).resolves.toEqual({
    allowedActions: { revoke: true },
    result: [],
    total: 0,
    pageNum: 1,
    pageSize: 20,
    pages: 0,
  });

  await expect(caller.admin.sessionManagement.listLoginRestrictions({
    conditions: { userId: 42 },
  })).resolves.toEqual({
    result: [],
    total: 0,
    pageNum: 1,
    pageSize: 20,
    pages: 0,
  });

  await expect(caller.admin.sessionManagement.revokeSessions({
    target: {
      type: "session",
      principalSessionId: "ps-target",
    },
  })).resolves.toEqual({
    changed: false,
    result: { scope: "session", currentPrincipalSessionExcluded: false, sessions: { userSessionsTerminated: 0, clientSessionsTerminated: 0, excluded: 0, failed: 0, unknown: 0 }, generation: "unified" as const, batch: { results: [], unfinished: [] }, artifactCleanup: { attempted: 0, succeeded: 0, failed: 0 } },
  });

  await expect(caller.admin.sessionManagement.revokeSessions({
    target: {
      type: "user",
      userId: 7,
    },
  })).resolves.toEqual({
    changed: false,
    result: { scope: "user", currentPrincipalSessionExcluded: true, sessions: { userSessionsTerminated: 0, clientSessionsTerminated: 0, excluded: 0, failed: 0, unknown: 0 }, generation: "unified" as const, batch: { results: [], unfinished: [] }, artifactCleanup: { attempted: 0, succeeded: 0, failed: 0 } },
  });

  await expect(caller.admin.sessionManagement.releaseLoginRestriction({
    userId: 42,
  })).resolves.toEqual({
    changed: false,
    result: {
      failureStateCleared: true,
    },
  });
});
