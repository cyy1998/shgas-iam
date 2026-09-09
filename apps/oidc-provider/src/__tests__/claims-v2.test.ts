import { OidcScope } from "@iam/contracts";
import { describe, expect, it } from "vitest";
import { createClaimsFixture as createOidcClaimsAdapter } from "../../test-integration/component/support/claims-fixture.ts";
import {
} from "../provider/claims.ts";
import {
  OidcClaimsSnapshotSchema,
  parseOidcClaimsSnapshot,
} from "../provider/claims/claims-snapshot.ts";

const subjectIdentifier = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";

function createOpenIdSnapshot() {
  return {
    version: 2 as const,
    claimsContractVersion: 2 as const,
    subjectIdentifier,
    clientId: "client-a",
    scopes: [OidcScope.OpenId],
    oidcConfigVersion: 3,
    providerSessionUid: "provider-a",
    principalSessionId: "principal-a",
    providerSessionBindingId: "binding-a",
    claims: { sub: subjectIdentifier },
  };
}

describe("oIDC claims V2 contract", () => {
  it("requires canonical responsibilities in every iam:employments item", () => {
    const snapshot = {
      version: 2,
      claimsContractVersion: 2,
      subjectIdentifier,
      clientId: "client-a",
      scopes: [OidcScope.OpenId, OidcScope.IamEmployments],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
      claims: {
        sub: subjectIdentifier,
        [OidcScope.IamEmployments]: [{
          isPrimary: true,
          organization: {
            orgCode: "dept-a",
            orgName: "Department A",
            orgType: "department",
            fullOrgPath: [{
              orgCode: "dept-a",
              orgName: "Department A",
              orgType: "department",
            }],
          },
          position: { posCode: "engineer", posName: "Engineer" },
          responsibilities: [{
            type: { code: "head", name: "负责人" },
            targetOrganization: {
              code: "dept-b",
              name: "Department B",
              type: "部门",
              path: [{
                code: "dept-b",
                name: "Department B",
                type: "部门",
              }],
            },
          }],
        }],
      },
    };

    expect(OidcClaimsSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(parseOidcClaimsSnapshot(snapshot)).toEqual(snapshot);
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      claims: {
        ...snapshot.claims,
        [OidcScope.IamEmployments]: snapshot.claims[OidcScope.IamEmployments]
          .map(({ responsibilities: _, ...employment }) => employment),
      },
    })).toBeNull();
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      claims: {
        ...snapshot.claims,
        [OidcScope.IamEmployments]: snapshot.claims[OidcScope.IamEmployments]
          .map(employment => ({
            ...employment,
            responsibilities: employment.responsibilities.map(
              responsibility => ({
                ...responsibility,
                type: { ...responsibility.type, code: "unknown" },
              }),
            ),
          })),
      },
    })).toBeNull();
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      claims: {
        ...snapshot.claims,
        [OidcScope.IamEmployments]: snapshot.claims[OidcScope.IamEmployments]
          .map(employment => ({
            ...employment,
            responsibilities: employment.responsibilities.map(
              responsibility => ({
                ...responsibility,
                targetOrganization: {
                  ...responsibility.targetOrganization,
                  path: [],
                },
              }),
            ),
          })),
      },
    })).toBeNull();
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      claims: {
        ...snapshot.claims,
        [OidcScope.IamEmployments]: snapshot.claims[OidcScope.IamEmployments]
          .map(employment => ({
            ...employment,
            responsibilities: employment.responsibilities.map(
              responsibility => ({
                ...responsibility,
                type: { ...responsibility.type, name: "错误名称" },
              }),
            ),
          })),
      },
    })).toBeNull();
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      claims: {
        ...snapshot.claims,
        [OidcScope.IamEmployments]: snapshot.claims[OidcScope.IamEmployments]
          .map(employment => ({
            ...employment,
            responsibilities: employment.responsibilities.map(
              responsibility => ({
                ...responsibility,
                targetOrganization: {
                  ...responsibility.targetOrganization,
                  path: [{
                    code: "another-target",
                    name: "Another Target",
                    type: "部门",
                  }],
                },
              }),
            ),
          })),
      },
    })).toBeNull();
  });

  it("rejects old, unknown, and contract-mismatched snapshots without fallback", async () => {
    const snapshot = createOpenIdSnapshot();
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      version: 1,
    })).toBeNull();
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      version: 3,
    })).toBeNull();
    expect(parseOidcClaimsSnapshot({
      ...snapshot,
      claimsContractVersion: 1,
    })).toBeNull();

    const reads = {
      account: 0,
      client: 0,
      projection: 0,
      providerSession: 0,
      session: 0,
      token: 0,
    };
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async () => {
          reads.account += 1;
          return null;
        },
      },
      clients: {
        findRuntime: async () => {
          reads.client += 1;
          return null;
        },
      },
      projection: {
        resolve: async () => {
          reads.projection += 1;
          throw new Error("old snapshots must not trigger a current facts read");
        },
      },
      providerSessions: {
        readForAccessToken: async () => {
          reads.providerSession += 1;
          return null;
        },
      },
      tokens: {
        resolveAccessTokenCredential: async () => {
          reads.token += 1;
          return null;
        },
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);
    const lifecycle = adapter as unknown as {
      createAccessTokenExtra: (
        token: unknown,
        code: unknown,
      ) => Promise<unknown>;
    };

    await expect(lifecycle.createAccessTokenExtra({
      kind: "AccessToken",
      accountId: subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
    }, {
      kind: "AuthorizationCode",
      authTime: 123,
      accountId: subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      claimsSnapshot: { ...snapshot, version: 1 },
    })).resolves.toBeUndefined();
    expect(reads).toEqual({
      account: 0,
      client: 0,
      projection: 0,
      providerSession: 0,
      session: 0,
      token: 0,
    });
  });

  it("maps V2 projection responsibilities only into iam:employments", async () => {
    const resolutions: unknown[] = [];
    const adapter = createOidcClaimsAdapter({
      accounts: { findBySubject: async () => null },
      clients: { findRuntime: async () => null },
      globalSessions: { resolveById: async () => null },
      projection: {
        resolve: async (input: unknown) => {
          resolutions.push(input);
          const employment = {
            isPrimary: true,
            organization: {
              code: "dept-a",
              name: "Department A",
              type: "部门",
              path: [{ code: "dept-a", name: "Department A", type: "部门" }],
            },
            position: { code: "engineer", name: "Engineer" },
          };
          const responsibilities = [{
            type: { code: "head", name: "负责人" },
            targetOrganization: {
              code: "dept-b",
              name: "Department B",
              type: "部门",
              path: [{ code: "dept-b", name: "Department B", type: "部门" }],
            },
          }];
          return {
            subjectIdentifier,
            employments: [{
              ...employment,
              responsibilities,
            }],
            authorization: {
              employments: [{
                ...employment,
                responsibilities,
                roles: ["app:user"],
                privileges: ["app:read"],
              }],
              roles: ["app:user"],
              privileges: ["app:read"],
            },
          };
        },
      },
      providerSessions: { readForAccessToken: async () => null },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);

    const snapshot = await adapter.createAuthorizationCodeSnapshot({
      subjectIdentifier,
      clientId: "client-a",
      scopes: [
        OidcScope.OpenId,
        OidcScope.IamEmployments,
        OidcScope.IamAuthorization,
      ],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
    });

    expect(resolutions).toEqual([expect.objectContaining({
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:employments", "iam:authorization"],
      },
    })]);
    expect(snapshot).toMatchObject({
      version: 2,
      claimsContractVersion: 2,
      oidcConfigVersion: 3,
      claims: {
        [OidcScope.IamEmployments]: [{
          responsibilities: [{
            type: { code: "head", name: "负责人" },
            targetOrganization: { code: "dept-b" },
          }],
        }],
        [OidcScope.IamAuthorization]: {
          employments: [{
            roles: ["app:user"],
            privileges: ["app:read"],
          }],
        },
      },
    });
    expect(snapshot.claims[OidcScope.IamAuthorization]?.employments[0])
      .not
      .toHaveProperty("responsibilities");
  });

  it("replays authorization-time responsibilities through Code and Token", async () => {
    let responsibilityCode: "head" | "supervising" = "head";
    let clientVersion = 3;
    let projectionReads = 0;
    const revokedCredentialIds: string[] = [];
    const adapter = createOidcClaimsAdapter({
      accounts: { findBySubject: async () => null },
      clients: {
        findRuntime: async () => ({ oidc_config_version: clientVersion }),
      },
      projection: {
        resolve: async () => {
          projectionReads += 1;
          return {
            subjectIdentifier,
            employments: [{
              isPrimary: true,
              organization: {
                code: "dept-a",
                name: "Department A",
                type: "部门",
                path: [{ code: "dept-a", name: "Department A", type: "部门" }],
              },
              position: { code: "engineer", name: "Engineer" },
              responsibilities: [{
                type: {
                  code: responsibilityCode,
                  name: responsibilityCode === "head" ? "负责人" : "分管领导",
                },
                targetOrganization: {
                  code: "dept-b",
                  name: "Department B",
                  type: "部门",
                  path: [{ code: "dept-b", name: "Department B", type: "部门" }],
                },
              }],
            }],
          };
        },
      },
      providerSessions: {
        readForAccessToken: async () => ({
          principalSessionId: "principal-a",
          bindingId: "binding-a",
          clientCode: "client-a",
          accountId: subjectIdentifier,
          authTime: 123,
          oidcConfigVersion: 3,
          expiresAt: Math.floor(Date.now() / 1000) + 300,
        }),
      },
      tokens: {
        resolveAccessTokenCredential: async () => ({
          credential: {
            principal: { subjectId: subjectIdentifier },
            credentialId: "credential-a",
            principalSessionId: "principal-a",
            bindingId: "binding-a",
            clientCode: "client-a",
          },
          metadata: {
            authTime: 123,
            providerTokenKey: "candidate:model:AccessToken:token-a",
            providerTokenId: "token-a",
            oidcConfigVersion: 3,
          },
        }),
        revokeAccessTokenCredential: async (credentialId: string) => {
          revokedCredentialIds.push(credentialId);
        },
      },
    } as never);
    const snapshotInput = {
      subjectIdentifier,
      clientId: "client-a",
      scopes: [OidcScope.OpenId, OidcScope.IamEmployments],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
    };
    const authorizationSnapshot = await adapter.createAuthorizationCodeSnapshot(
      snapshotInput,
    );
    responsibilityCode = "supervising";
    const token = {
      kind: "AccessToken",
      jti: "token-a",
      accountId: subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid iam:employments",
      scopes: new Set(["openid", "iam:employments"]),
    };
    const code = {
      kind: "AuthorizationCode",
      authTime: 123,
      accountId: subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid iam:employments",
      scopes: new Set(["openid", "iam:employments"]),
      claimsSnapshot: authorizationSnapshot,
    };

    const lifecycle = adapter as unknown as {
      createAccessTokenExtra: (
        token: unknown,
        code: unknown,
      ) => Promise<Record<string, unknown> | undefined>;
      findAccount: (
        subject: string,
        token: unknown,
      ) => Promise<{
        claims: (use: string) => Promise<Record<string, unknown>>;
      } | undefined>;
    };
    const extra = await lifecycle.createAccessTokenExtra(token, code);
    const resolved = await lifecycle.findAccount(subjectIdentifier, {
      ...token,
      extra: { authTime: 123, ...extra, kernelCredentialId: "credential-a" },
    });

    expect(projectionReads).toBe(1);
    expect(await resolved?.claims("userinfo")).toMatchObject({
      [OidcScope.IamEmployments]: [{
        responsibilities: [{ type: { code: "head" } }],
      }],
    });
    const idTokenClaims = await resolved?.claims("id_token");
    expect(idTokenClaims).not.toHaveProperty(OidcScope.IamEmployments);
    expect(idTokenClaims).not.toHaveProperty(OidcScope.IamAuthorization);
    expect(JSON.stringify(idTokenClaims)).not.toContain("responsibilit");

    const nextSnapshot = await adapter.createAuthorizationCodeSnapshot(snapshotInput);
    expect(nextSnapshot.claims).toMatchObject({
      [OidcScope.IamEmployments]: [{
        responsibilities: [{ type: { code: "supervising" } }],
      }],
    });
    expect(projectionReads).toBe(2);

    clientVersion = 4;
    await expect(lifecycle.findAccount(subjectIdentifier, {
      ...token,
      extra: { authTime: 123, ...extra, kernelCredentialId: "credential-a" },
    })).resolves.toBeUndefined();
    expect(revokedCredentialIds).toEqual(["credential-a"]);
    expect(projectionReads).toBe(2);
  });
});
