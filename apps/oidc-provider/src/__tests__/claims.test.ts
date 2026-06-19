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
    sessionId: "global-a",
    userId: account.id,
    accountId: account.oidcSubject,
    authTime: 123,
  };
  redis.values.set(providerSessionBindingKey("provider-a"), JSON.stringify({
    globalSessionId: session.sessionId,
    userId: session.userId,
    accountId: session.accountId,
    authTime: session.authTime,
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
      revokeAccessToken: async (tokenKey: string) => {
        redis.values.delete(tokenKey);
      },
    },
  });
  return { account, client, redis, service };
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
      globalSessionId: "global-a",
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

    const resolved = await service.findAccount(account.oidcSubject, { ...token, extra } as never);
    expect(await resolved?.claims("userinfo")).toHaveProperty("iam:authorization");
    expect(await resolved?.claims("id_token")).not.toHaveProperty("iam:authorization");
  });

  it("rejects and removes a token when the client version no longer matches", async () => {
    const { account, client, redis, service } = createFixture();
    const tokenKey = "oidc:model:AccessToken:token-a";
    redis.values.set(tokenKey, "stored");
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
        globalSessionId: "global-a",
        authTime: 123,
        scopes: ["openid"],
        oidcConfigVersion: client.oidc_config_version + 1,
        userInfoSnapshot: { sub: account.oidcSubject },
      },
    } as never);

    expect(resolved).toBeUndefined();
    expect(redis.values.has(tokenKey)).toBe(false);
  });
});
