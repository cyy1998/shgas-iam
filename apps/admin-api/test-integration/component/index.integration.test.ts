import type { Context } from "hono";
import { createSessionManagementAdapter } from "@admin-api/routes/admin/session-management/session-management.adapter";
import { createAdminRouter } from "@admin-api/trpc/routers/admin";
import { createAppRouter } from "@admin-api/trpc/trpc.router";
import { router } from "@iam/api-core/trpc";
import { expect, test } from "bun:test";

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
        failureStateCleared: true,
      }),
      revokeSessions: async input => ({
        changed: false,
        scope: input.target.type,
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: input.target.type === "user" && input.target.userId === 7,
        cleanup: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
        },
      }),
    },
  }).sessionManagementAdminRouter;
  const appRouter = createAppRouter(createAdminRouter({
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
    scope: "session",
    revoked: {
      principalSessions: 0,
      bindings: 0,
      credentials: 0,
      artifacts: 0,
    },
    currentPrincipalSessionExcluded: false,
    cleanup: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
    },
  });

  await expect(caller.admin.sessionManagement.revokeSessions({
    target: {
      type: "user",
      userId: 7,
    },
  })).resolves.toEqual({
    changed: false,
    scope: "user",
    revoked: {
      principalSessions: 0,
      bindings: 0,
      credentials: 0,
      artifacts: 0,
    },
    currentPrincipalSessionExcluded: true,
    cleanup: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
    },
  });

  await expect(caller.admin.sessionManagement.releaseLoginRestriction({
    userId: 42,
  })).resolves.toEqual({
    changed: false,
    failureStateCleared: true,
  });
});
