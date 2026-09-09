import { describe, expect, test } from "bun:test";
import { createAuthorizationGrantRedemptionCleanupAdapter } from "../../src/grant/cleanup";

describe("Legacy Authorization Grant cleanup", () => {
  test("removes only the exact Custom SSO grant identities supplied by Kernel cleanup", async () => {
    const removed: string[] = [];
    const adapter = createAuthorizationGrantRedemptionCleanupAdapter({
      remove: async (grantId) => {
        removed.push(grantId);
        return "removed" as const;
      },
    });

    await adapter.cleanup([
      { protocol: "custom-sso", kind: "authorization-grant-redemption", ref: "grant-1" },
      { protocol: "custom-sso", kind: "authorization-grant-redemption", ref: "grant-2" },
    ], {
      deleteOwnedKeys: async () => {
        throw new Error("Grant cleanup uses its own identity");
      },
    });

    expect(removed).toEqual(["grant-1", "grant-2"]);
  });
});
