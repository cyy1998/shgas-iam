import { describe, expect, test } from "bun:test";
import {
  ADMIN_AUTHORIZATION_REASON_CODES,
  ADMIN_MODULE_CODES,
  AdminCapabilitySummarySchema,
  AdminOrganizationAllowedActionsSchema,
  AdminUserAllowedActionsSchema,
} from "../admin-authorization";

describe("Admin authorization contract", () => {
  test("accepts a complete explicit capability summary", () => {
    const result = AdminCapabilitySummarySchema.parse({
      visibleModules: [...ADMIN_MODULE_CODES],
      collectionActions: {
        user: { create: { allowed: true, reason: null } },
        employment: { create: { allowed: true, reason: null } },
        organization: { createRoot: { allowed: false, reason: "ACTION_NOT_GRANTED" } },
        position: {
          create: { allowed: true, reason: null },
          edit: { allowed: true, reason: null },
          changeStatus: { allowed: true, reason: null },
          delete: { allowed: true, reason: null },
        },
      },
    });

    expect(result.visibleModules).toEqual([...ADMIN_MODULE_CODES]);
    expect(ADMIN_AUTHORIZATION_REASON_CODES).toEqual([
      "ACTION_NOT_GRANTED",
      "RESOURCE_OUT_OF_SCOPE",
      "USER_NOT_HR_MANAGED",
      "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
      "USER_NOT_ENABLED",
      "RESOURCE_STATE_NOT_ACTIONABLE",
      "INTEGRITY_GUARD_BLOCKED",
    ]);
  });

  test("rejects omitted decisions and inconsistent allowed/reason pairs", () => {
    expect(() => AdminCapabilitySummarySchema.parse({
      visibleModules: ["user"],
      collectionActions: {
        user: { create: { allowed: true, reason: "ACTION_NOT_GRANTED" } },
      },
    })).toThrow();

    expect(() => AdminCapabilitySummarySchema.parse({
      visibleModules: ["future-module"],
      collectionActions: {},
    })).toThrow();
  });

  test("requires every canonical User detail action decision", () => {
    const denied = { allowed: false, reason: "ACTION_NOT_GRANTED" } as const;

    expect(AdminUserAllowedActionsSchema.parse({
      editProfile: denied,
      resetPassword: denied,
      changeStatus: denied,
      delete: denied,
      resign: denied,
    })).toEqual({
      editProfile: denied,
      resetPassword: denied,
      changeStatus: denied,
      delete: denied,
      resign: denied,
    });
    expect(() => AdminUserAllowedActionsSchema.parse({
      editProfile: denied,
    })).toThrow();
  });

  test("requires every canonical Organization detail action decision", () => {
    const allowed = { allowed: true, reason: null } as const;
    const denied = { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" } as const;

    expect(AdminOrganizationAllowedActionsSchema.parse({
      createChild: allowed,
      edit: allowed,
      changeStatus: denied,
      delete: denied,
    })).toEqual({
      createChild: allowed,
      edit: allowed,
      changeStatus: denied,
      delete: denied,
    });
    expect(() => AdminOrganizationAllowedActionsSchema.parse({
      createChild: allowed,
      edit: allowed,
      changeStatus: denied,
    })).toThrow();
  });
});
