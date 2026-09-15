import type { ClientSnapshotValue } from "@iam/api-core/client-snapshot";
import type { SubjectFactsSnapshot } from "@iam/client-subject-projection";
import { randomUUID } from "node:crypto";
import { ClientSsoProtocol, ClientStatus, OidcClientType, OidcScope, OrganizationType } from "@iam/contracts";
import { expect, test } from "bun:test";
import { userInfoFixture } from "./oidc-userinfo.fixture";

test("UserInfo real GET/POST and form Bearer transport retain standard errors and registered Client CORS", async () => {
  const f = await userInfoFixture();
  try {
    const issued = await f.issue();
    for (const method of ["GET", "POST"]) {
      const result = await f.me(issued.access_token, method, { Origin: "https://rp.example" });
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({
        "sub": f.subjectIdentifier,
        "preferred_username": "test",
        "name": "测试",
        "phone_number": "17721462865",
        "iam:employments": [],
        "iam:authorization": { employments: [], roles: [], privileges: [] },
      });
      expect(result.headers.get("Access-Control-Allow-Origin")).toBe("https://rp.example");
      expect(result.headers.get("Access-Control-Allow-Credentials")).toBeNull();
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    }
    const form = await f.request("/oidc/me", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: issued.access_token }),
    });
    expect(form.status).toBe(200);
    await f.setClient(value => ({
      ...value,
      ssoConfig:
        value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
          ? { ...value.ssoConfig, clientType: OidcClientType.Confidential }
          : null,
    }));
    const confidential = await f.me(issued.access_token, "GET", { Origin: "https://rp.example" });
    expect(confidential.status).toBe(200);
    expect(confidential.headers.get("Access-Control-Allow-Origin")).toBe("https://rp.example");
    const denied = await f.me(issued.access_token, "GET", { Origin: "https://evil.example" });
    expect(denied.status).toBe(400);
    expect(await denied.json()).toMatchObject({ error: "invalid_request" });
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const preflight = await f.request("/oidc/me", {
      method: "OPTIONS",
      headers: {
        "Origin": "https://rp.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
    const discovery = await (await f.request("/oidc/.well-known/openid-configuration")).json();
    expect(discovery.userinfo_endpoint).toBe("https://iam.example/oidc/me");
    const invalidRequests: Array<{ path: string; options: RequestInit; status: number; code: string }> = [
      { path: "/oidc/me", options: {}, status: 401, code: "invalid_token" },
      {
        path: "/oidc/me",
        options: { headers: { Authorization: "Bearer unknown" } },
        status: 401,
        code: "invalid_token",
      },
      {
        path: "/oidc/me",
        options: { headers: { Authorization: "Basic invalid" } },
        status: 400,
        code: "invalid_request",
      },
      {
        path: `/oidc/me?access_token=${issued.access_token}`,
        options: {},
        status: 400,
        code: "invalid_request",
      },
      {
        path: "/oidc/me",
        options: {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${issued.access_token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ access_token: issued.access_token }),
        },
        status: 400,
        code: "invalid_request",
      },
    ];
    for (const input of invalidRequests) {
      const response = await f.request(input.path, input.options);
      expect(response.status).toBe(input.status);
      expect(await response.json()).toMatchObject({ error: input.code });
      expect(response.headers.get("WWW-Authenticate")).toStartWith("Bearer ");
    }
  }
  finally {
    await f.close();
  }
});

test("UserInfo current added and removed scopes affect old Tokens, preserve ID Token and no lifecycle renewal", async () => {
  const f = await userInfoFixture();
  try {
    await f.scopes([OidcScope.OpenId]);
    const issued = await f.issue();
    const originalToken = await f.oidcState.readToken(issued.access_token);
    const originalSession = await f.scope.inspect(issued.target);
    const first = await f.me(issued.access_token);
    expect(await first.json()).toEqual({ sub: f.subjectIdentifier });
    expect(f.state.factReads).toBe(0);
    await f.scopes([
      OidcScope.OpenId,
      OidcScope.Profile,
      OidcScope.Phone,
      OidcScope.IamEmployments,
      OidcScope.IamAuthorization,
    ]);
    const before = { reads: f.state.reads, acquisitions: f.state.acquisitions };
    const added = await f.me(issued.access_token);
    expect(await added.json()).toMatchObject({
      "sub": f.subjectIdentifier,
      "name": "测试",
      "phone_number": "17721462865",
      "iam:employments": [],
      "iam:authorization": { roles: [] },
    });
    expect(f.state.reads - before.reads).toBe(1);
    expect(f.state.acquisitions - before.acquisitions).toBe(1);
    await f.scopes([OidcScope.OpenId]);
    f.state.factFailure = true;
    const removed = await f.me(issued.access_token);
    expect(await removed.json()).toEqual({ sub: f.subjectIdentifier });
    expect(f.state.factReads).toBe(1);
    expect(await f.oidcState.readToken(issued.access_token)).toEqual(originalToken);
    expect(await f.scope.inspect(issued.target)).toEqual(originalSession);
    const idClaims = JSON.parse(Buffer.from(issued.id_token.split(".")[1]!, "base64url").toString());
    expect(Object.keys(idClaims).sort()).toEqual(["aud", "auth_time", "exp", "iat", "iss", "sub"]);
  }
  finally {
    await f.close();
  }
});

test("UserInfo checks the original root even when the child index is missing", async () => {
  const f = await userInfoFixture();
  try {
    const issued = await f.issue();
    await f.oidcState.forgetTokenIndex(issued.access_token);
    expect((await f.me(issued.access_token)).status).toBe(200);
    await f.scope.forgetChildIndex(issued.record.userSessionId);
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.observeUserSessionForRevocation(issued.record.userSessionId);
      if (root.status !== "resolved")
        throw new Error("Missing root");
      const revoked = await sessions.revokeObservedUserSession(root.value);
      expect(revoked.status).toBe("terminated");
    });
    expect((await f.me(issued.access_token)).status).toBe(401);
    expect(await f.oidcState.readToken(issued.access_token)).not.toBeNull();
  }
  finally {
    await f.close();
  }
});

test("UserInfo corrupt Token is unavailable without terminating its original instance", async () => {
  const f = await userInfoFixture();
  try {
    const issued = await f.issue();
    const before = await f.scope.inspect(issued.target);
    await f.oidcState.corruptToken(issued.access_token);
    const response = await f.me(issued.access_token);
    expect(response.status).toBe(503);
    expect(await f.scope.inspect(issued.target)).toEqual(before);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  }
  finally {
    await f.close();
  }
});

test("UserInfo protocol/enablement/maintenance changes recover original Token until exact instance is revoked", async () => {
  const f = await userInfoFixture();
  try {
    const issued = await f.issue();
    let original: ClientSnapshotValue;
    await f.setClient((value) => {
      original = value;
      return value;
    });
    for (const change of [
      { ssoEnabled: false },
      { status: ClientStatus.Maintenance },
      {
        ssoConfig: {
          protocol: ClientSsoProtocol.CustomSso,
          callbackEndpoint: "https://rp.example/callback",
          validRedirectUrls: ["https://rp.example/*"],
          subjectClaims: ["subjectIdentifier"],
        },
      },
    ] satisfies Partial<ClientSnapshotValue>[]) {
      await f.setClient(value => ({ ...value, ...change }));
      const denied = await f.me(issued.access_token);
      expect(denied.status).toBe("status" in change ? 503 : 401);
      expect(await denied.json()).toMatchObject({
        error: "status" in change ? "temporarily_unavailable" : "invalid_token",
      });
      await f.setClient(() => original!);
      expect((await f.me(issued.access_token)).status).toBe(200);
    }
    await f.operations.run(async (operation) => {
      const session = f.kernel.forOperation(operation);
      const root = await session.resolveUserSession(f.cookies.get("global_session")!);
      if (root.status !== "resolved")
        throw new Error("Missing root");
      await session.openClientSession(root.value, { clientId: f.clientId, protocol: "custom_sso" });
    });
    expect((await f.me(issued.access_token)).status).toBe(200);
    await f.operations.run(async (operation) => {
      const session = f.kernel.forOperation(operation);
      const observed = await session.observeClientSessionForRevocation({
        userSessionId: issued.record.userSessionId,
        clientSessionId: issued.record.clientSessionId,
        clientId: f.clientId,
      });
      if (observed.status !== "resolved")
        throw new Error("Missing instance");
      await session.revokeObservedClientSession(observed.value);
    });
    const replacement = await f.issue();
    expect(replacement.record.clientSessionId).not.toBe(issued.record.clientSessionId);
    expect((await f.me(issued.access_token)).status).toBe(401);
    expect((await f.me(replacement.access_token)).status).toBe(200);
  }
  finally {
    await f.close();
  }
});

for (const failure of ["clientFailure", "factFailure", "permission"] as const) {
  test(`UserInfo ${failure} remains transient and preserves reusable Token`, async () => {
    const f = await userInfoFixture();
    try {
      const issued = await f.issue();
      if (failure === "permission")
        f.state.permission = "unknown";
      else f.state[failure] = true;
      const response = await f.me(issued.access_token);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "temporarily_unavailable" });
      expect(response.headers.get("Retry-After")).toBe("3");
      if (failure === "permission")
        f.state.permission = "enabled";
      else f.state[failure] = false;
      expect((await f.me(issued.access_token)).status).toBe(200);
    }
    finally {
      await f.close();
    }
  });
}

test("UserInfo preserves an observed in-flight request and rejects next request after account disable", async () => {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = await userInfoFixture({
    async read(subject) {
      entered();
      await gate;
      return {
        subjectIdentifier: subject,
        sourceDirtyVersion: "1",
        profile: { username: "old", name: "已发布", phone: null },
        employments: [],
      };
    },
  });
  try {
    const issued = await f.issue();
    const response = f.me(issued.access_token);
    await ready;
    f.state.permission = "disabled";
    release();
    expect((await response).status).toBe(200);
    expect((await f.me(issued.access_token)).status).toBe(401);
    f.state.permission = "enabled";
    expect((await f.me(issued.access_token)).status).toBe(401);
  }
  finally {
    release();
    await f.close();
  }
});

test("UserInfo maps published employment wire and isolates two Clients authorization without ORCAS fields", async () => {
  const other = `other-${randomUUID()}`;
  let first = "";
  const f = await userInfoFixture({
    async read(subject): Promise<SubjectFactsSnapshot> {
      return {
        subjectIdentifier: subject,
        sourceDirtyVersion: "1",
        profile: { username: "old", name: "旧权限", phone: null },
        employments: [
          {
            isPrimary: true,
            organization: {
              code: "org",
              name: "组织",
              type: OrganizationType.Department,
              path: [{ code: "org", name: "组织", type: OrganizationType.Department }],
            },
            position: { code: "position", name: "岗位" },
            responsibilities: [],
            clientAuthorizations: [
              { clientCode: first, roles: [{ code: "a", privileges: ["a:read"] }] },
              { clientCode: other, roles: [{ code: "b", privileges: ["b:write"] }] },
            ],
          },
        ],
      };
    },
  });
  try {
    first = f.clientId;
    f.addClient(other);
    for (const [client, role, privilege] of [
      [first, "a", "a:read"],
      [other, "b", "b:write"],
    ]) {
      const issued = await f.issue("openid", client);
      const value = await (await f.me(issued.access_token)).json();
      expect(value["iam:authorization"].roles).toEqual([role]);
      expect(value["iam:authorization"].privileges).toEqual([privilege]);
      expect(value["iam:employments"]).toEqual([
        {
          isPrimary: true,
          organization: {
            orgCode: "org",
            orgName: "组织",
            orgType: OrganizationType.Department,
            fullOrgPath: [{ orgCode: "org", orgName: "组织", orgType: OrganizationType.Department }],
          },
          position: { posCode: "position", posName: "岗位" },
          responsibilities: [],
        },
      ]);
    }
  }
  finally {
    await f.close();
  }
});
