import { describe, expect, it } from "vitest";
import { createOidcClaimsAdapter } from "../provider/claims.ts";

describe("oidc Subject Identifier continuity", () => {
  it("maps the IAM Subject Identifier to sub without changing its UUID", async () => {
    const subjectIdentifier = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async subject => subject === subjectIdentifier
          ? {
              id: 7,
              subjectIdentifier,
              username: "alice",
              name: "Alice",
              mobile: null,
              status: 1,
              isDelete: false,
            }
          : null,
      },
      clients: {
        findRuntime: async () => null,
      },
      globalSessions: {
        resolveById: async () => null,
      },
      projection: {
        resolve: async () => ({ subjectIdentifier }),
      },
      providerSessions: {
        read: async () => null,
      },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    });

    const account = await adapter.findAccount(subjectIdentifier);

    expect(account?.accountId).toBe(subjectIdentifier);
    expect(await account?.claims("id_token")).toMatchObject({
      sub: subjectIdentifier,
    });
  });
});
