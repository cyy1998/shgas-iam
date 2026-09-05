import type { OidcClientRuntimeMetadata } from "../provider/client/client-runtime-metadata.ts";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { OidcScope } from "@iam/contracts";
import { errors } from "oidc-provider";
import { describe, expect, it } from "vitest";
import { createOidcClaimsAdapter } from "../provider/claims.ts";

function createOpenIdClaimsSnapshot(
  subjectIdentifier: string,
  oidcConfigVersion: number,
) {
  return {
    version: 2 as const,
    claimsContractVersion: 2 as const,
    subjectIdentifier,
    clientId: "client-a",
    scopes: ["openid"],
    oidcConfigVersion,
    providerSessionUid: "provider-a",
    principalSessionId: "principal-a",
    providerSessionBindingId: "binding-a",
    claims: { sub: subjectIdentifier },
  };
}

function createFixture() {
  const account = {
    id: 7,
    subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
    username: "alice",
    name: "Alice",
    mobile: "13800000000",
    status: 1,
    isDelete: false,
  };
  const client: OidcClientRuntimeMetadata = {
    client_id: "client-a",
    client_name: "Client A",
    redirect_uris: ["https://client.example.com/callback"],
    post_logout_redirect_uris: [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    subject_type: "public",
    id_token_signed_response_alg: "RS256",
    require_auth_time: true,
    token_endpoint_auth_method: "none",
    scope: "openid profile phone iam:authorization",
    iam_client_id: 11,
    oidc_config_version: 3,
    allowed_scopes: ["openid", "profile", "phone", "iam:authorization"],
  };
  const session = {
    sessionId: "principal-a",
    accountId: account.subjectIdentifier,
    authTime: 123,
  };
  const revokedCredentialIds: string[] = [];
  const credential = {
    credential: {
      credentialId: "credential-a",
      principalSessionId: session.sessionId,
      bindingId: "binding-a",
      clientCode: "client-a",
    },
    metadata: {
      providerTokenKey: "oidc:model:AccessToken:token-a",
      providerTokenId: "token-a",
      oidcConfigVersion: client.oidc_config_version,
    },
  };
  const providerBinding = {
    principalSessionId: session.sessionId,
    bindingId: "binding-a",
    clientCode: "client-a",
    accountId: session.accountId,
    authTime: session.authTime,
    oidcConfigVersion: client.oidc_config_version,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  };
  const adapter = createOidcClaimsAdapter({
    accounts: {
      findBySubject: async (subject: string) => subject === account.subjectIdentifier ? account : null,
    },
    clients: {
      findRuntime: async () => client,
    },
    globalSessions: {
      resolveById: async (sessionId: string) => sessionId === session.sessionId ? session : null,
    },
    projection: {
      resolve: async () => ({
        subjectIdentifier: account.subjectIdentifier,
        username: account.username,
        name: account.name,
        phone: account.mobile,
        authorization: {
          employments: [],
          roles: ["app:user"],
          privileges: ["app:read"],
        },
      }),
    },
    providerSessions: {
      read: async (sessionUid: string, clientCode: string) => sessionUid === "provider-a"
        && clientCode === "client-a"
        ? structuredClone(providerBinding)
        : null,
    },
    tokens: {
      resolveAccessTokenCredential: async (externalToken: string) => externalToken === "token-a" ? credential : null,
      revokeAccessTokenCredential: async (credentialId: string) => {
        revokedCredentialIds.push(credentialId);
      },
    },
  });
  return { account, adapter, client, credential, providerBinding, revokedCredentialIds, session };
}

describe("oIDC claims and UserInfo snapshot", () => {
  it("maps only the actually authorized OIDC scopes into a Subject Claim Selection", async () => {
    const resolutions: unknown[] = [];
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async () => null,
      },
      clients: {
        findRuntime: async () => null,
      },
      globalSessions: {
        resolveById: async () => null,
      },
      projection: {
        resolve: async (input: unknown) => {
          resolutions.push(input);
          return {
            subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
            username: "alice",
            name: "Alice",
          };
        },
      },
      providerSessions: {
        read: async () => null,
      },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);

    const snapshot = await (adapter as unknown as {
      createAuthorizationCodeSnapshot: (input: unknown) => Promise<unknown>;
    }).createAuthorizationCodeSnapshot({
      subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientId: "client-a",
      scopes: ["openid", "profile"],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
    });

    expect(resolutions).toEqual([{
      subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:username", "profile:name"],
      },
    }]);
    expect(snapshot).toMatchObject({
      subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientId: "client-a",
      scopes: ["openid", "profile"],
      claims: {
        sub: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
        preferred_username: "alice",
        name: "Alice",
      },
    });
    expect(snapshot).not.toHaveProperty("claims.iam:employments");
  });

  it("keeps the existing OIDC employment wire names and adds isPrimary for dedicated UserInfo scopes", async () => {
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
              type: "department",
              path: [
                { code: "company", name: "Company", type: "company" },
                { code: "dept-a", name: "Department A", type: "department" },
              ],
            },
            position: { code: "engineer", name: "Engineer" },
            responsibilities: [],
          };
          return {
            subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
            employments: [employment],
            authorization: {
              employments: [{ ...employment, roles: ["app:user"], privileges: ["app:read"] }],
              roles: ["app:user"],
              privileges: ["app:read"],
            },
          };
        },
      },
      providerSessions: { read: async () => null },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);

    const snapshot = await adapter.createAuthorizationCodeSnapshot({
      subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientId: "client-a",
      scopes: [OidcScope.OpenId, OidcScope.IamEmployments, OidcScope.IamAuthorization],
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
    expect(snapshot.claims).toEqual({
      "sub": "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      "iam:employments": [{
        isPrimary: true,
        organization: {
          orgCode: "dept-a",
          orgName: "Department A",
          orgType: "department",
          fullOrgPath: [
            { orgCode: "company", orgName: "Company", orgType: "company" },
            { orgCode: "dept-a", orgName: "Department A", orgType: "department" },
          ],
        },
        position: { posCode: "engineer", posName: "Engineer" },
        responsibilities: [],
      }],
      "iam:authorization": {
        employments: [{
          isPrimary: true,
          organization: {
            orgCode: "dept-a",
            orgName: "Department A",
            orgType: "department",
            fullOrgPath: [
              { orgCode: "company", orgName: "Company", orgType: "company" },
              { orgCode: "dept-a", orgName: "Department A", orgType: "department" },
            ],
          },
          position: { posCode: "engineer", posName: "Engineer" },
          roles: ["app:user"],
          privileges: ["app:read"],
        }],
        roles: ["app:user"],
        privileges: ["app:read"],
      },
    });
    expect(JSON.stringify(snapshot.claims)).not.toContain("\"code\"");
    expect(JSON.stringify(snapshot.claims)).not.toContain("\"path\"");
  });

  it("maps a strict authorization snapshot that is not ready to temporarily_unavailable", async () => {
    const adapter = createOidcClaimsAdapter({
      accounts: { findBySubject: async () => null },
      clients: { findRuntime: async () => null },
      globalSessions: { resolveById: async () => null },
      projection: {
        resolve: async () => {
          throw new SubjectProjectionNotReadyError();
        },
      },
      providerSessions: { read: async () => null },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);

    await expect(adapter.createAuthorizationCodeSnapshot({
      subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientId: "client-a",
      scopes: [OidcScope.OpenId, OidcScope.IamAuthorization],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
    })).rejects.toBeInstanceOf(errors.TemporarilyUnavailable);
  });

  it("transfers the Code Claims Snapshot to the Access Token without rebuilding subject facts", async () => {
    const reads = {
      account: 0,
      authorization: 0,
      client: 0,
      globalSession: 0,
      projection: 0,
      providerSession: 0,
    };
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async () => {
          reads.account += 1;
          return {
            id: 7,
            subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
            username: "current-alice",
            name: "Current Alice",
            mobile: null,
            status: 1,
            isDelete: false,
          };
        },
      },
      clients: {
        findRuntime: async () => {
          reads.client += 1;
          return null;
        },
      },
      globalSessions: {
        resolveById: async () => {
          reads.globalSession += 1;
          return null;
        },
      },
      projection: {
        resolve: async () => {
          reads.projection += 1;
          throw new Error("projection must not be rebuilt at the token endpoint");
        },
      },
      providerSessions: {
        read: async () => {
          reads.providerSession += 1;
          return null;
        },
      },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);
    const claimsSnapshot = {
      version: 2 as const,
      claimsContractVersion: 2 as const,
      subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientId: "client-a",
      scopes: ["openid", "profile"],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
      claims: {
        sub: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
        preferred_username: "alice-at-authorization",
        name: "Alice at authorization",
      },
    };
    const token = {
      kind: "AccessToken",
      accountId: claimsSnapshot.subjectIdentifier,
      clientId: claimsSnapshot.clientId,
      sessionUid: claimsSnapshot.providerSessionUid,
      scope: "openid profile",
      scopes: new Set(["openid", "profile"]),
    };
    const code = {
      kind: "AuthorizationCode",
      accountId: claimsSnapshot.subjectIdentifier,
      clientId: claimsSnapshot.clientId,
      sessionUid: claimsSnapshot.providerSessionUid,
      scope: "openid profile",
      scopes: new Set(["openid", "profile"]),
      claimsSnapshot,
    };

    const extra = await (adapter.createAccessTokenExtra as unknown as (
      token: unknown,
      code: unknown,
    ) => Promise<unknown>)(token, code);

    expect(extra).toEqual({ claimsSnapshot });
    expect(reads).toEqual({
      account: 0,
      authorization: 0,
      client: 0,
      globalSession: 0,
      projection: 0,
      providerSession: 0,
    });
  });

  it("fails closed instead of rebuilding an Access Token snapshot when the Code snapshot is missing", async () => {
    const reads = { account: 0, authorization: 0, client: 0, projection: 0 };
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async () => {
          reads.account += 1;
          return {
            id: 7,
            subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
            username: "current-alice",
            name: "Current Alice",
            mobile: null,
            status: 1,
            isDelete: false,
          };
        },
      },
      clients: {
        findRuntime: async () => {
          reads.client += 1;
          return { iam_client_id: 11, oidc_config_version: 3 };
        },
      },
      globalSessions: {
        resolveById: async () => ({
          sessionId: "principal-a",
          accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
          authTime: 123,
        }),
      },
      projection: {
        resolve: async () => {
          reads.projection += 1;
          throw new Error("projection must not be rebuilt");
        },
      },
      providerSessions: {
        read: async () => ({
          principalSessionId: "principal-a",
          bindingId: "binding-a",
          clientCode: "client-a",
          accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
          authTime: 123,
          oidcConfigVersion: 3,
          expiresAt: Math.floor(Date.now() / 1000) + 300,
        }),
      },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);

    await expect(adapter.createAccessTokenExtra({
      kind: "AccessToken",
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid profile",
      scopes: new Set(["openid", "profile"]),
    } as never)).resolves.toBeUndefined();
    expect(reads).toEqual({ account: 0, authorization: 0, client: 0, projection: 0 });
  });

  it("fails closed instead of rebuilding claims when an Authorization Code snapshot is missing", async () => {
    const reads = { account: 0, authorization: 0, client: 0, projection: 0 };
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async () => {
          reads.account += 1;
          return {
            id: 7,
            subjectIdentifier: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
            username: "current-alice",
            name: "Current Alice",
            mobile: "13800000000",
            status: 1,
            isDelete: false,
          };
        },
      },
      clients: {
        findRuntime: async () => {
          reads.client += 1;
          return { iam_client_id: 11, oidc_config_version: 3 };
        },
      },
      globalSessions: { resolveById: async () => null },
      projection: {
        resolve: async () => {
          reads.projection += 1;
          throw new Error("projection must not be rebuilt");
        },
      },
      providerSessions: { read: async () => null },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);

    const resolved = await adapter.findAccount("57b0e34d-bf33-4671-87ea-4ed2f1b0e420", {
      kind: "AuthorizationCode",
      authTime: 456,
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid profile iam:authorization",
      scopes: new Set(["openid", "profile", "iam:authorization"]),
    } as never);

    expect(resolved).toBeUndefined();
    expect(reads).toEqual({ account: 0, authorization: 0, client: 0, projection: 0 });
  });

  it("replays only the Access Token snapshot for UserInfo without a current account or projection read", async () => {
    const subjectIdentifier = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";
    const claimsSnapshot = {
      version: 2 as const,
      claimsContractVersion: 2 as const,
      subjectIdentifier,
      clientId: "client-a",
      scopes: ["openid", "profile"],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
      claims: {
        sub: subjectIdentifier,
        preferred_username: "alice-at-authorization",
        name: "Alice at authorization",
      },
    };
    const currentFactsReads = { account: 0, authorization: 0, projection: 0 };
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async () => {
          currentFactsReads.account += 1;
          throw new Error("UserInfo must not read the current account profile");
        },
      },
      clients: {
        findRuntime: async () => ({ oidc_config_version: 3 }),
      },
      globalSessions: {
        resolveById: async () => ({
          sessionId: "principal-a",
          accountId: subjectIdentifier,
          authTime: 123,
        }),
      },
      projection: {
        resolve: async () => {
          currentFactsReads.projection += 1;
          throw new Error("UserInfo must not rebuild the projection");
        },
      },
      providerSessions: {
        read: async () => ({
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
            credentialId: "credential-a",
            principalSessionId: "principal-a",
            bindingId: "binding-a",
            clientCode: "client-a",
          },
          metadata: {
            providerTokenKey: "oidc:model:AccessToken:token-a",
            providerTokenId: "token-a",
            oidcConfigVersion: 3,
          },
        }),
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);

    const resolved = await adapter.findAccount(subjectIdentifier, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid profile",
      scopes: new Set(["openid", "profile"]),
      extra: { claimsSnapshot, kernelCredentialId: "credential-a" },
    } as never);

    expect(await resolved?.claims("userinfo")).toEqual(claimsSnapshot.claims);
    expect(currentFactsReads).toEqual({ account: 0, authorization: 0, projection: 0 });
  });

  it("rejects malformed or scope-inconsistent Access Token snapshots", async () => {
    const { account, adapter, client, revokedCredentialIds } = createFixture();
    const claimsSnapshot = {
      ...createOpenIdClaimsSnapshot(account.subjectIdentifier, client.oidc_config_version),
      claims: {
        sub: account.subjectIdentifier,
        name: 42,
      },
    };

    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      extra: {
        claimsSnapshot,
        kernelCredentialId: "credential-a",
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(revokedCredentialIds).toEqual([]);

    const incomplete = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid iam:authorization",
      scopes: new Set(["openid", "iam:authorization"]),
      extra: {
        claimsSnapshot: {
          ...createOpenIdClaimsSnapshot(account.subjectIdentifier, client.oidc_config_version),
          scopes: ["openid", "iam:authorization"],
        },
        kernelCredentialId: "credential-a",
      },
    } as never);

    expect(incomplete).toBeUndefined();
    expect(revokedCredentialIds).toEqual([]);
  });

  it("maps the Code snapshot to ID Token claims without the dedicated UserInfo claims or current profile reads", async () => {
    const subjectIdentifier = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";
    const currentFactsReads = { account: 0, authorization: 0, projection: 0 };
    const adapter = createOidcClaimsAdapter({
      accounts: {
        findBySubject: async () => {
          currentFactsReads.account += 1;
          throw new Error("ID Token must not read the current account profile");
        },
      },
      clients: { findRuntime: async () => null },
      globalSessions: { resolveById: async () => null },
      projection: {
        resolve: async () => {
          currentFactsReads.projection += 1;
          throw new Error("ID Token must not rebuild the projection");
        },
      },
      providerSessions: { read: async () => null },
      tokens: {
        resolveAccessTokenCredential: async () => null,
        revokeAccessTokenCredential: async () => undefined,
      },
    } as never);
    const code = {
      kind: "AuthorizationCode",
      authTime: 456,
      accountId: subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid profile phone iam:employments iam:authorization",
      scopes: new Set(["openid", "profile", "phone", "iam:employments", "iam:authorization"]),
      claimsSnapshot: {
        version: 2,
        claimsContractVersion: 2,
        subjectIdentifier,
        clientId: "client-a",
        scopes: ["openid", "profile", "phone", "iam:employments", "iam:authorization"],
        oidcConfigVersion: 3,
        providerSessionUid: "provider-a",
        principalSessionId: "principal-a",
        providerSessionBindingId: "binding-a",
        claims: {
          "sub": subjectIdentifier,
          "name": "Alice at authorization",
          "preferred_username": "alice-at-authorization",
          "phone_number": "13800000000",
          "iam:employments": [],
          "iam:authorization": { employments: [], roles: [], privileges: [] },
        },
      },
    };

    const resolved = await adapter.findAccount(subjectIdentifier, code as never);

    expect(await resolved?.claims("id_token")).toEqual({
      sub: subjectIdentifier,
      name: "Alice at authorization",
      preferred_username: "alice-at-authorization",
      phone_number: "13800000000",
      auth_time: 456,
    });
    expect(currentFactsReads).toEqual({ account: 0, authorization: 0, projection: 0 });
  });

  it("stores only scope-authorized claims and excludes authorization data from ID Token claims", async () => {
    const { account, adapter } = createFixture();
    const token = {
      kind: "AccessToken",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid profile iam:authorization",
      scopes: new Set(["openid", "profile", "iam:authorization"]),
    };
    const claimsSnapshot = await adapter.createAuthorizationCodeSnapshot({
      subjectIdentifier: account.subjectIdentifier,
      clientId: "client-a",
      scopes: [OidcScope.OpenId, OidcScope.Profile, OidcScope.IamAuthorization],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
    });
    const code = {
      kind: "AuthorizationCode",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid profile iam:authorization",
      scopes: new Set(["openid", "profile", "iam:authorization"]),
      claimsSnapshot,
    };
    const extra = await adapter.createAccessTokenExtra(token as never, code as never);

    expect(extra).toEqual({
      claimsSnapshot: expect.objectContaining({
        subjectIdentifier: account.subjectIdentifier,
        clientId: "client-a",
        scopes: ["openid", "profile", "iam:authorization"],
        oidcConfigVersion: 3,
        claims: {
          "sub": account.subjectIdentifier,
          "name": "Alice",
          "preferred_username": "alice",
          "iam:authorization": {
            employments: [],
            roles: ["app:user"],
            privileges: ["app:read"],
          },
        },
      }),
    });
    expect(extra?.claimsSnapshot.claims).not.toHaveProperty("phone_number");
    expect(extra?.claimsSnapshot.claims).not.toHaveProperty("id");

    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      ...token,
      jti: "token-a",
      extra: { ...extra, kernelCredentialId: "credential-a" },
    } as never);
    expect(await resolved?.claims("userinfo")).toHaveProperty("iam:authorization");
    expect(await resolved?.claims("id_token")).not.toHaveProperty("iam:authorization");
  });

  it("builds an authorization-code snapshot and exposes auth_time only in ID Token claims", async () => {
    const { account, adapter } = createFixture();
    const claimsSnapshot = await adapter.createAuthorizationCodeSnapshot({
      subjectIdentifier: account.subjectIdentifier,
      clientId: "client-a",
      scopes: [OidcScope.OpenId, OidcScope.Phone, OidcScope.IamAuthorization],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
    });
    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AuthorizationCode",
      authTime: 456,
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid phone iam:authorization",
      scopes: new Set(["openid", "phone", "iam:authorization"]),
      claimsSnapshot,
    } as never);

    expect(await resolved?.claims("userinfo")).toEqual({
      "sub": account.subjectIdentifier,
      "phone_number": "13800000000",
      "iam:authorization": {
        employments: [],
        roles: ["app:user"],
        privileges: ["app:read"],
      },
    });
    expect(await resolved?.claims("id_token")).toEqual({
      sub: account.subjectIdentifier,
      phone_number: "13800000000",
      auth_time: 456,
    });
  });

  it("rejects and removes a token when the client version no longer matches", async () => {
    const { account, adapter, client, revokedCredentialIds } = createFixture();
    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      extra: {
        claimsSnapshot: createOpenIdClaimsSnapshot(
          account.subjectIdentifier,
          client.oidc_config_version + 1,
        ),
        kernelCredentialId: "credential-a",
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(revokedCredentialIds).toEqual(["credential-a"]);
  });

  it("rejects an unresolved access-token credential without adding a revocation side effect", async () => {
    const { account, adapter, client, revokedCredentialIds } = createFixture();
    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AccessToken",
      jti: "missing-token",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      extra: {
        claimsSnapshot: createOpenIdClaimsSnapshot(account.subjectIdentifier, client.oidc_config_version),
        kernelCredentialId: "credential-a",
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(revokedCredentialIds).toEqual([]);
  });

  it("revokes a resolved credential when the provider binding no longer matches", async () => {
    const { account, adapter, client, providerBinding, revokedCredentialIds } = createFixture();
    providerBinding.bindingId = "binding-b";

    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      extra: {
        claimsSnapshot: createOpenIdClaimsSnapshot(account.subjectIdentifier, client.oidc_config_version),
        kernelCredentialId: "credential-a",
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(revokedCredentialIds).toEqual(["credential-a"]);
  });

  it("revokes a resolved credential when the global session no longer matches its binding", async () => {
    const { account, adapter, client, revokedCredentialIds, session } = createFixture();
    session.authTime = 999;

    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      extra: {
        claimsSnapshot: createOpenIdClaimsSnapshot(account.subjectIdentifier, client.oidc_config_version),
        kernelCredentialId: "credential-a",
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(revokedCredentialIds).toEqual(["credential-a"]);
  });

  it("revokes a resolved credential when its config metadata is stale", async () => {
    const { account, adapter, client, credential, revokedCredentialIds } = createFixture();
    credential.metadata.oidcConfigVersion = client.oidc_config_version + 1;

    const resolved = await adapter.findAccount(account.subjectIdentifier, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: account.subjectIdentifier,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      extra: {
        claimsSnapshot: createOpenIdClaimsSnapshot(account.subjectIdentifier, client.oidc_config_version),
        kernelCredentialId: "credential-a",
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(revokedCredentialIds).toEqual(["credential-a"]);
  });
});
