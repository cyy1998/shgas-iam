import { describe, expect, it } from "vitest";
import { createOidcClaimsService } from "../provider/claims.ts";
import { providerSessionBindingKey } from "../session/provider-session.ts";

class ClaimsRedis {
  values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async del(...keys: string[]) {
    keys.forEach(key => this.values.delete(key));
    return keys.length;
  }
}

function createFixture() {
  const redis = new ClaimsRedis();
  const account = {
    id: 7,
    oidcSubject: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
    username: "alice",
    name: "Alice",
    mobile: "13800000000",
    status: 1,
    isDelete: false,
  };
  const client = {
    client_id: "client-a",
    iam_client_id: 11,
    oidc_config_version: 3,
    allowed_scopes: ["openid", "profile", "phone", "iam:authorization"],
  };
  const session = {
    sessionId: "principal-a",
    userId: account.id,
    accountId: account.oidcSubject,
    authTime: 123,
  };
  const revokedCredentialIds: string[] = [];
  redis.values.set(providerSessionBindingKey("provider-a"), JSON.stringify({
    globalSessionId: session.sessionId,
    principalSessionId: session.sessionId,
    bindingId: "binding-a",
    userId: session.userId,
    accountId: session.accountId,
    authTime: session.authTime,
    oidcConfigVersion: client.oidc_config_version,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  }));
  const service = createOidcClaimsService({
    accounts: {
      findBySubject: async (subject: string) => subject === account.oidcSubject ? account : null,
    },
    authorization: {
      buildClaim: async () => ({
        employments: [],
        roles: ["app:user"],
        privileges: ["app:read"],
      }),
    },
    clients: {
      findRuntime: async () => client,
    },
    globalSessions: {
      resolveById: async (sessionId: string) => sessionId === session.sessionId ? session : null,
    },
    providerSessions: {
      read: async (sessionUid: string) => {
        const value = redis.values.get(providerSessionBindingKey(sessionUid));
        return value ? JSON.parse(value) : null;
      },
    },
    tokens: {
      resolveAccessTokenCredential: async (externalToken: string) => externalToken === "token-a"
        ? {
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
          }
        : null,
      revokeAccessTokenCredential: async (credentialId: string) => {
        revokedCredentialIds.push(credentialId);
      },
    },
  });
  return { account, client, redis, revokedCredentialIds, service };
}

describe("oIDC claims and UserInfo snapshot", () => {
  it("stores only scope-authorized claims and excludes authorization data from ID Token claims", async () => {
    const { account, service } = createFixture();
    const token = {
      kind: "AccessToken",
      accountId: account.oidcSubject,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid profile iam:authorization",
      scopes: new Set(["openid", "profile", "iam:authorization"]),
    };
    const extra = await service.createAccessTokenExtra(token as never);

    expect(extra).toMatchObject({
      userId: 7,
      globalSessionId: "principal-a",
      authTime: 123,
      oidcConfigVersion: 3,
      userInfoSnapshot: {
        "sub": account.oidcSubject,
        "name": "Alice",
        "preferred_username": "alice",
        "iam:authorization": {
          roles: ["app:user"],
          privileges: ["app:read"],
        },
      },
    });
    expect(extra?.userInfoSnapshot).not.toHaveProperty("phone_number");
    expect(extra?.userInfoSnapshot).not.toHaveProperty("id");

    const resolved = await service.findAccount(account.oidcSubject, {
      ...token,
      jti: "token-a",
      extra: { ...extra, kernelCredentialId: "credential-a" },
    } as never);
    expect(await resolved?.claims("userinfo")).toHaveProperty("iam:authorization");
    expect(await resolved?.claims("id_token")).not.toHaveProperty("iam:authorization");
  });

  it("rejects and removes a token when the client version no longer matches", async () => {
    const { account, client, revokedCredentialIds, service } = createFixture();
    const resolved = await service.findAccount(account.oidcSubject, {
      kind: "AccessToken",
      jti: "token-a",
      accountId: account.oidcSubject,
      clientId: "client-a",
      sessionUid: "provider-a",
      scope: "openid",
      scopes: new Set(["openid"]),
      extra: {
        userId: account.id,
        globalSessionId: "principal-a",
        authTime: 123,
        scopes: ["openid"],
        oidcConfigVersion: client.oidc_config_version + 1,
        kernelCredentialId: "credential-a",
        userInfoSnapshot: { sub: account.oidcSubject },
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(revokedCredentialIds).toEqual(["credential-a"]);
  });
});
