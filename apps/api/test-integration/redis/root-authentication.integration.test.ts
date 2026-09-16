import type { ClientSnapshotValue } from "@iam/api-core/client-snapshot";
import { randomUUID } from "node:crypto";
import { connect, createServer } from "node:net";
import process from "node:process";
import { clientSnapshotKeys } from "@iam/api-core/client-snapshot/testing";
import {
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import {
  ClientSsoCallbackType,
  ClientSsoProtocol,
  ClientStatus,
  OidcClientType,
  OidcScope,
  SubjectClaim,
} from "@iam/contracts";
import { CustomSsoManagedFailure } from "@iam/custom-sso";

import { expect, test } from "bun:test";
import Redis from "ioredis";

import { fixture } from "./root-authentication.fixture";

test("the protocol fixture requires its dedicated Redis URL before creating state", async () => {
  const previous = process.env.IAM_API_TEST_REDIS_URL;
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    delete process.env.IAM_API_TEST_REDIS_URL;
    let error: unknown;
    try {
      f = await fixture();
    }
    catch (failure) {
      error = failure;
    }
    expect(error).toMatchObject({ message: "IAM_API_TEST_REDIS_URL is required" });
  }
  finally {
    if (previous === undefined)
      delete process.env.IAM_API_TEST_REDIS_URL;
    else process.env.IAM_API_TEST_REDIS_URL = previous;
    await f?.scope.close();
  }
});

test.each(["https://internal.example", "https://public.example"])("Custom login stays on entry %s and preserves its configured public managed callback", async (origin) => {
  const f = await fixture();
  try {
    f.setClient({
      ...f.getClient(),
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        callbackEndpoint: "https://iam.example/sso/callback",
        validRedirectUrls: ["https://app.example/callback"],
        subjectClaims: [SubjectClaim.SubjectIdentifier],
      },
    });
    const response = await f.app.request(`${origin}/sso/authorize?client=iam&redirectUrl=https://app.example/callback`);
    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toStartWith("/portal/login?");
    const login = new URL(location, origin);
    expect(login.origin).toBe(origin);
    const binding = /custom_sso_continuation=([^;]+)/u.exec(response.headers.get("set-cookie")!)![1];
    const token = await f.login();
    const resumed = await f.app.request(`${origin}/sso/authorize?${login.searchParams}`, {
      headers: { Cookie: `global_session=${token}; custom_sso_continuation=${binding}` },
    });
    expect(resumed.status).toBe(302);
    const callback = new URL(resumed.headers.get("Location")!);
    expect(callback.origin + callback.pathname).toBe("https://iam.example/sso/callback");
    expect(callback.searchParams.get("redirectUrl")).toBe("https://app.example/callback");
  }
  finally {
    await f.scope.close();
  }
});

test("Custom candidate accepts browser-bound continuation, preserves original callback and redirect after edits", async () => {
  const f = await fixture();
  try {
    const query = new URLSearchParams({
      client: "iam",
      redirectUrl: "https://app.example/callback",
      state: "opaque-state",
    });
    const start = await f.app.request(`/sso/authorize?${query}`);
    expect(start.status).toBe(302);
    expect(start.headers.get("location")).toStartWith("/portal/login?");
    const login = new URL(start.headers.get("location")!, "https://internal.example");
    const binding = /custom_sso_continuation=([^;]+)/u.exec(start.headers.get("set-cookie")!)![1];
    expect(login.searchParams.has("token")).toBe(false);
    expect(login.searchParams.get("ssoReturn")).toHaveLength(43);
    f.setClient({
      ...f.getClient(),
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        callbackEndpoint: "https://iam.example/sso/callback",
        validRedirectUrls: ["https://other.example/home"],
        subjectClaims: [SubjectClaim.SubjectIdentifier],
      },
    });
    const token = await f.login();
    const headers = { Cookie: `global_session=${token}; custom_sso_continuation=${binding}` };
    const guard = await f.app.request(`/sso/login-guard?${login.searchParams}`, { headers });
    expect(guard.status).toBe(200);
    const guardBody = await guard.json();
    expect(guardBody.data.decision).toBe("continue");
    const wrongBrowser = await f.app.request(`/sso/authorize?${login.searchParams}`, {
      headers: { Cookie: `global_session=${token}` },
    });
    expect(wrongBrowser.status).not.toBe(302);
    const wrongStateQuery = new URLSearchParams(login.searchParams);
    wrongStateQuery.set("state", "changed");
    const wrongState = await f.app.request(`/sso/authorize?${wrongStateQuery}`, { headers });
    expect(wrongState.status).toBe(400);
    const fresh = await f.app.request(`/sso/authorize?${query}`, { headers });
    expect(fresh.status).not.toBe(302);
    f.state.clientReads = 0;
    f.state.permissionReads = 0;
    const resumed = await f.app.request(`/sso/authorize?${login.searchParams}`, { headers });
    expect(resumed.status).toBe(302);
    expect(f.state.clientReads).toBe(1);
    expect(f.state.permissionReads).toBe(1);
    const callback = new URL(resumed.headers.get("location")!);
    expect(callback.origin + callback.pathname).toBe("https://app.example/callback");
    expect(callback.searchParams.get("state")).toBe("opaque-state");
    const code = callback.searchParams.get("code")!;
    expect(code.split(".")).toHaveLength(3);
    const record = await f.codes.inspectCode("iam", code);
    expect(record).toMatchObject({
      redeemer: "business",
      callbackEndpoint: "https://app.example/callback",
      redirectUrl: "https://app.example/callback",
      state: "opaque-state",
    });
    f.setClient({ ...f.getClient(), status: ClientStatus.Maintenance });
    const paused = await f.app.request(`/sso/authorize?${login.searchParams}`, { headers });
    expect(paused.status).toBe(503);
    expect(paused.headers.get("set-cookie")).toBeNull();
    f.setClient({
      ...f.getClient(),
      status: ClientStatus.Enable,
      ssoConfig: {
        protocol: ClientSsoProtocol.Oidc,
        clientType: OidcClientType.Public,
        redirectUris: ["https://app.example/callback"],
        postLogoutRedirectUris: [],
        allowedScopes: [OidcScope.OpenId],
      },
    });
    const switched = await f.app.request(`/sso/authorize?${login.searchParams}`, { headers });
    expect(switched.status).not.toBe(302);
    await f.operations.run(async (operation) => {
      const relation = await f.kernel
        .forOperation(operation)
        .resolveClientSessionForUse({
          clientId: "iam",
          userSessionId: record!.userSessionId,
          clientSessionId: record!.clientSessionId,
        });
      expect(relation.status).toBe("resolved");
    });
  }
  finally {
    await f.scope.close();
  }
});

test("Custom candidate concurrent authorization binds exact instances and fixed Code deadlines", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const request = (client: string) =>
      f.app.request(
        `/sso/authorize?${new URLSearchParams({ client, redirectUrl: "https://app.example/callback" })}`,
        { headers: { Cookie: `global_session=${token}` } },
      );
    const responses = await Promise.all(Array.from({ length: 8 }, () => request("iam")));
    const records = [];
    for (const response of responses) {
      expect(response.status).toBe(302);
      const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
      const record = await f.codes.inspectCode("iam", code);
      expect(record).not.toBeNull();
      records.push(record!);
      const wrongClient = await f.codes.inspectCode("other", code);
      expect(wrongClient).toBeNull();
      const wrongRoot = await f.codes.inspectCode(
        "iam",
        `${code.split(".")[0]}.${randomUUID()}.${record!.clientSessionId}`,
      );
      expect(wrongRoot).toBeNull();
    }
    expect(new Set(records.map(record => record.clientSessionId)).size).toBe(1);
    const original = records[0]!;
    expect(original.expiresAt - original.issuedAt).toBe(30000);
    const other = await request("other");
    const otherCode = new URL(other.headers.get("location")!).searchParams.get("code")!;
    const otherRecord = await f.codes.inspectCode("other", otherCode);
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.resolveUserSession(token);
      if (root.status !== "resolved")
        throw new Error("missing root");
      expect(root.value.userSession.expiresAt - root.value.userSession.createdAt).toBe(120000);
      const switched = await sessions.openClientSession(root.value, { clientId: "iam", protocol: "oidc" });
      if (switched.status !== "created" && switched.status !== "reused")
        throw new Error("missing client");
      expect(switched.value.clientSession.clientSessionId).toBe(original.clientSessionId);
    });
    const reused = await request("iam");
    const reusedRecord = await f.codes.inspectCode(
      "iam",
      new URL(reused.headers.get("location")!).searchParams.get("code")!,
    );
    expect(reusedRecord!.clientSessionId).toBe(original.clientSessionId);
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const current = await sessions.resolveClientSessionForUse({
        clientId: "iam",
        userSessionId: original.userSessionId,
        clientSessionId: original.clientSessionId,
      });
      if (current.status !== "resolved")
        throw new Error("missing relation");
      expect(current.value.clientSession.protocol).toBe("custom_sso");
      const revoked = await sessions.revokeObservedClientSession(current.value);
      expect(revoked.status).toBe("terminated");
      const remaining = await sessions.resolveClientSessionForUse({
        clientId: "other",
        userSessionId: otherRecord!.userSessionId,
        clientSessionId: otherRecord!.clientSessionId,
      });
      expect(remaining.status).toBe("resolved");
    });
    const next = await request("iam");
    const nextRecord = await f.codes.inspectCode(
      "iam",
      new URL(next.headers.get("location")!).searchParams.get("code")!,
    );
    expect(nextRecord!.clientSessionId).not.toBe(original.clientSessionId);
    const oldCode = new URL(responses[0]!.headers.get("location")!).searchParams.get("code")!;
    const unchanged = await f.codes.inspectCode("iam", oldCode);
    expect(unchanged).toEqual(original);
  }
  finally {
    await f.scope.close();
  }
});

test("Custom callback type controls authorization independently of path and host", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const cases: Array<[string, ClientSsoCallbackType]> = [
      ["https://iam.example/sso/callback", ClientSsoCallbackType.Business],
      ["https://business.example/sso/callback", ClientSsoCallbackType.Managed],
      ["https://iam.example/another/callback", ClientSsoCallbackType.Managed],
      ["https://iam.example:444/sso/callback", ClientSsoCallbackType.Business],
    ];
    for (const [callbackEndpoint, redeemer] of cases) {
      f.setClient({
        ...f.getClient(),
        ssoConfig: {
          protocol: ClientSsoProtocol.CustomSso,
          callbackType: redeemer,
          callbackEndpoint: callbackEndpoint!,
          validRedirectUrls: ["https://app.example/callback"],
          subjectClaims: [SubjectClaim.SubjectIdentifier],
        },
      });
      const response = await f.app.request(
        "/sso/authorize?client=iam&redirectUrl=https://app.example/callback",
        {
          headers: {
            Cookie: `global_session=${token}`,
            Host: "iam.example",
            Forwarded: "host=iam.example;proto=https",
          },
        },
      );
      expect(response.status).toBe(302);
      const callback = new URL(response.headers.get("location")!);
      expect(callback.origin + callback.pathname).toBe(callbackEndpoint!);
      const record = await f.codes.inspectCode("iam", callback.searchParams.get("code")!);
      expect(record!.redeemer).toBe(redeemer!);
      expect(record!.state).toBeUndefined();
    }
    f.scope.afterNext("resolveUser", async () => {
      f.setClient({ ...f.getClient(), ssoEnabled: false });
    });
    const accepted = await f.app.request(
      "/sso/authorize?client=iam&redirectUrl=https://app.example/callback",
      { headers: { Cookie: `global_session=${token}` } },
    );
    expect(accepted.status).toBe(302);
    const later = await f.app.request("/sso/authorize?client=iam&redirectUrl=https://app.example/callback", {
      headers: { Cookie: `global_session=${token}` },
    });
    expect(later.status).not.toBe(302);
  }
  finally {
    await f.scope.close();
  }
});

test("Custom Code expiry is clipped to original ClientSession and natural expiry leaves no usable record", async () => {
  for (const ttl of [300, 1]) {
    const f = await fixture(ttl);
    try {
      const token = await f.login();
      const response = await f.app.request(
        "/sso/authorize?client=iam&redirectUrl=https://app.example/callback",
        { headers: { Cookie: `global_session=${token}` } },
      );
      const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
      const record = await f.codes.inspectCode("iam", code);
      expect(record).not.toBeNull();
      await f.operations.run(async (operation) => {
        const relation = await f.kernel
          .forOperation(operation)
          .resolveClientSessionForUse({
            clientId: "iam",
            userSessionId: record!.userSessionId,
            clientSessionId: record!.clientSessionId,
          });
        if (relation.status !== "resolved")
          throw new Error("Missing relationship");
        expect(record!.expiresAt).toBeLessThanOrEqual(relation.value.userSession.expiresAt);
        if (ttl === 300)
          expect(record!.expiresAt).toBe(relation.value.clientSession.expiresAt);
      });
      if (ttl === 1) {
        await new Promise(resolve => setTimeout(resolve, 1100));
        const expired = await f.codes.inspectCode("iam", code);
        expect(expired).toBeNull();
      }
    }
    finally {
      await f.scope.close();
    }
  }
});

test("Custom state failure and wrong continuation keep the browser root and never deliver a Code", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const headers = { Cookie: `global_session=${token}` };
    const query = new URLSearchParams({ client: "iam", redirectUrl: "https://app.example/callback" });
    for (const after of [false, true]) {
      f.codes.failNext(after);
      const failed = await f.app.request(`/sso/authorize?${query}`, { headers });
      expect(failed.status).toBe(503);
      expect(failed.headers.get("location")).toBeNull();
      expect(failed.headers.get("set-cookie")).toBeNull();
    }
    const invalid = await f.app.request(`/sso/login-guard?${query}&ssoReturn=${"x".repeat(43)}`, { headers });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("set-cookie")).toBeNull();
    const info = await f.app.request("/public/user-info", { headers: { ...headers, Client: "iam" } });
    expect(info.status).toBe(200);
  }
  finally {
    await f.scope.close();
  }
});

test("candidate four authentication handlers validate credentials and create independent fixed roots", async () => {
  const f = await fixture();
  try {
    const bad = await f.password("wrong");
    expect(bad.status).not.toBe(200);
    expect(f.state.failures).toBe(1);
    f.state.restriction = true;
    const restricted = await f.password();
    expect(restricted.status).not.toBe(200);
    f.state.restriction = false;
    const password = await f.password();
    const mobile = await f.app.request("/auth/login/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: "17721462865", code: "sms-code" }),
    });
    const oa = await f.app.request(
      `/sso/thirdparty/oa?${new URLSearchParams({ loginid: "138550", ts: "1700000000000", token: f.oaToken, client: "iam", redirectUrl: "https://app.example/callback" })}`,
    );
    const wx = await f.app.request(
      `/sso/third-party/wx?${new URLSearchParams({ code: "wx-code", client: "iam", redirectUrl: "https://app.example/callback" })}`,
    );
    expect([password.status, mobile.status, oa.status, wx.status]).toEqual([200, 200, 302, 302]);
    const ids: string[] = [];
    for (const [index, response] of [password, mobile, oa, wx].entries()) {
      expect(response.headers.get("set-cookie")).toContain("Max-Age=120");
      const token = f.cookie(response);
      if (!token)
        throw new Error("Missing root cookie");
      await f.operations.run(async (operation) => {
        const result = await f.kernel.forOperation(operation).resolveUserSession(token);
        if (result.status !== "resolved")
          throw new Error("Missing root");
        ids.push(result.value.userSession.userSessionId);
        expect(result.value.userSession.amr).toEqual([["pwd"], ["sms"], ["oa"], ["wechat"]][index]!);
        expect(result.value.userSession.expiresAt - result.value.userSession.createdAt).toBe(120000);
      });
    }
    expect(new Set(ids).size).toBe(4);
    expect(f.audits.filter(a => a.outcome === "success").map(a => a.action)).toEqual([
      "auth.login.password",
      "auth.login.mobile",
      "auth.login.oa",
      "auth.login.wechat",
    ]);
  }
  finally {
    await f.scope.close();
  }
});

test("candidate root UserInfo keeps Client delivery, published facts and one permission through in-flight completion", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const headers = { Client: "iam", Cookie: `global_session=${token}` };
    f.state.permissionReads = 0;
    f.duringFacts(async () => {
      f.state.permission = "disabled";
    });
    const first = await f.app.request("/public/user-info", { headers });
    expect(first.status).toBe(200);
    expect(f.state.permissionReads).toBe(1);
    expect(f.state.factsReads).toBe(1);
    const denied = await f.app.request("/public/user-info", { headers });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("set-cookie")).toContain("Max-Age=0");
    f.state.permission = "enabled";
    f.state.generation = randomUUID();
    const old = await f.app.request("/public/user-info", { headers });
    expect(old.status).toBe(401);
    const fresh = await f.login();
    f.setClient({ ...f.getClient(), ssoEnabled: false });
    const disabledClient = await f.app.request("/public/user-info", {
      headers: { Client: "iam", Cookie: `global_session=${fresh}` },
    });
    expect(disabledClient.status).toBe(401);
    expect(disabledClient.headers.get("set-cookie")).toBeNull();
  }
  finally {
    await f.scope.close();
  }
});

test("unified login guard preserves temporary Cookie state and logout terminates the observed root", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const path = `/sso/login-guard?${new URLSearchParams({ client: "iam", redirectUrl: "https://app.example/callback" })}`;
    const headers = { Cookie: `global_session=${token}` };
    const absent = await f.app.request(path);
    const absentBody = await absent.json();
    expect(absent.status).toBe(200);
    expect(absentBody).toMatchObject({ data: { decision: "login" } });
    expect(absent.headers.getSetCookie()).toEqual([]);
    const reuse = await f.app.request(path, { headers });
    const reuseBody = await reuse.json();
    expect(reuse.status).toBe(200);
    expect(reuseBody).toMatchObject({ data: { decision: "continue" } });
    f.state.permission = "unknown";
    const unknown = await f.app.request(path, { headers });
    expect(unknown.status).toBe(503);
    expect(unknown.headers.get("set-cookie")).toBeNull();
    f.state.permission = "enabled";
    f.scope.failNext("resolveUser");
    const storageUnknown = await f.app.request(path, { headers });
    expect(storageUnknown.status).toBe(503);
    expect(storageUnknown.headers.get("set-cookie")).toBeNull();
    const before = f.state.permissionReads;
    const invalid = await f.app.request(
      "/sso/login-guard?client=iam&redirectUrl=https%3A%2F%2Fevil.example",
      { headers },
    );
    expect(invalid.status).not.toBe(200);
    expect(f.state.permissionReads).toBe(before);
    const logout = await f.app.request("/sso/logout?redirectUrl=https%3A%2F%2Fiam.example", { headers });
    expect(logout.status).toBe(302);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    f.state.permission = "enabled";
    const after = await f.app.request(path, { headers });
    const afterBody = await after.json();
    expect(afterBody).toMatchObject({ data: { decision: "login" } });
    expect(after.headers.getSetCookie()).toEqual([expect.stringMatching(/global_session=;.*Max-Age=0/u)]);
  }
  finally {
    await f.scope.close();
  }
});

test("candidate rejects invalid SMS, OA, Wechat and malformed password credentials before root creation", async () => {
  const f = await fixture();
  try {
    const sms = await f.app.request("/auth/login/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: "17721462865", code: "wrong-code" }),
    });
    const oa = await f.app.request(
      `/sso/thirdparty/oa?${new URLSearchParams({ loginid: "138550", ts: "1700000000000", token: "wrong", client: "iam", redirectUrl: "https://app.example/callback" })}`,
    );
    const wx = await f.app.request(
      `/sso/third-party/wx?${new URLSearchParams({ code: "wrong", client: "iam", redirectUrl: "https://app.example/callback" })}`,
    );
    const password = await f.app.request("/auth/login/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "bad" }),
    });
    for (const response of [sms, oa, wx, password]) {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    const count = await f.scope.countRecords();
    expect(count).toBe(0);
    expect(f.audits.some(audit => audit.outcome === "success")).toBe(false);
  }
  finally {
    await f.scope.close();
  }
});

test("candidate sub-only delivery avoids Facts, never falls back from a cookie, and logout works with a missing child index", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const client = f.getClient();
    if (client.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso)
      throw new Error("Expected Custom configuration");
    f.setClient({
      ...client,
      ssoConfig: { ...client.ssoConfig, subjectClaims: [SubjectClaim.SubjectIdentifier] },
    });
    f.duringFacts(async () => {
      throw new Error("Facts must not be read for sub-only");
    });
    const info = await f.app.request("/public/user-info", {
      headers: { Client: "iam", Cookie: `global_session=${token}` },
    });
    expect(info.status).toBe(200);
    expect(f.state.factsReads).toBe(0);
    const invalidCookie = await f.app.request("/public/user-info", {
      headers: { Client: "iam", Cookie: "global_session=invalid", Authorization: token },
    });
    expect(invalidCookie.status).toBe(401);
    const legacyRedis = new Redis(process.env.IAM_API_TEST_REDIS_URL!);
    const legacyToken = `iam_ps_legacy_${randomUUID()}`;
    const legacyKey = `global_session:${legacyToken}`;
    try {
      await legacyRedis.set(legacyKey, JSON.stringify({ subjectIdentifier: f.subjectIdentifier }), "EX", 60);
      const legacy = await f.app.request("/public/user-info", {
        headers: { Client: "iam", Authorization: legacyToken },
      });
      expect(legacy.status).toBe(401);
      const legacyExists = await legacyRedis.exists(legacyKey);
      expect(legacyExists).toBe(1);
    }
    finally {
      await legacyRedis.del(legacyKey);
      legacyRedis.disconnect();
    }
    const child = await f.operations.run(async (operation) => {
      const root = await f.kernel.forOperation(operation).resolveUserSession(token);
      if (root.status !== "resolved")
        throw new Error("Missing root");
      const child = await f.kernel
        .forOperation(operation)
        .openClientSession(root.value, { clientId: "application", protocol: "oidc" });
      if (child.status !== "created" && child.status !== "reused")
        throw new Error("Missing child");
      return child.value.clientSession;
    });
    await f.scope.forgetChildIndex(child.userSessionId);
    const logout = await f.app.request("/sso/logout?redirectUrl=https%3A%2F%2Fiam.example", {
      headers: { Cookie: `global_session=${token}` },
    });
    expect(logout.status).toBe(302);
    const access = await f.operations.run(
      async operation =>
        await f.kernel
          .forOperation(operation)
          .resolveClientSessionForUse({
            userSessionId: child.userSessionId,
            clientSessionId: child.clientSessionId,
            clientId: child.clientId,
          }),
    );
    expect(access.status).toBe("terminated");
  }
  finally {
    await f.scope.close();
  }
});

async function businessFixture(codeTtlSeconds = 30, networkUrl?: string, tokenTtlSeconds = 45) {
  const f = await fixture(codeTtlSeconds, networkUrl, tokenTtlSeconds);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: f.app.fetch });
  const request = (path: string, init?: RequestInit) =>
    fetch(new URL(path, server.url), { ...init, redirect: "manual" });
  const root = await f.login();
  async function authorize(client = f.businessClientCode, bearer = root) {
    const response = await request(
      `/sso/authorize?${new URLSearchParams({ client, redirectUrl: "https://app.example/callback" })}`,
      { headers: { Cookie: `global_session=${bearer}` } },
    );
    expect(response.status).toBe(302);
    return new URL(response.headers.get("location")!).searchParams.get("code")!;
  }
  const exchange = (
    code: string,
    secret = "business-secret",
    suffix = "",
    redirect = "https://app.example/callback",
    client = f.businessClientCode,
  ) =>
    request(`/sso/token${suffix}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${client}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ code, redirect_uri: redirect }),
    });
  const use = (sid: string, client = f.businessClientCode, authz = false) =>
    request(authz ? "/auth/authz" : "/public/user-info", {
      headers: { "Authorization": sid, "Client": client, "X-Forwarded-Uri": "/home" },
    });
  async function target(code: string, client = f.businessClientCode) {
    return await f.operations.run(async (operation) => {
      const result = await f.kernel
        .forOperation(operation)
        .observeClientSessionForRevocation({
          userSessionId: code.split(".")[1]!,
          clientSessionId: code.split(".")[2]!,
          clientId: client,
        });
      if (result.status !== "resolved")
        throw new Error("Test target missing");
      return result.value.target;
    });
  }
  return {
    ...f,
    root,
    request,
    authorize,
    exchange,
    use,
    target,
    async close() {
      await server.stop(true);
      await f.scope.close();
    },
  };
}

async function managedFixture(orcasEnabled = true) {
  const f = await businessFixture();
  const received: unknown[] = [];
  const external = { reject: false };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      received.push(await request.json());
      return Response.json(
        { code: external.reject ? 500 : 200, data: { id: "external-user-reference" } },
        { headers: { "Set-Cookie": "orcas_sso_sessionid=external-session; Path=/; HttpOnly" } },
      );
    },
  });
  f.state.orcasUrl = server.url.href;
  const original = f.getClient();
  const config = {
    protocol: ClientSsoProtocol.CustomSso,
    callbackType: ClientSsoCallbackType.Managed,
    callbackEndpoint: "https://iam.example/sso/callback",
    validRedirectUrls: ["https://app.example/callback"],
    subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
    orcas: { enabled: orcasEnabled },
  } satisfies ClientSnapshotValue["ssoConfig"];
  f.setClient({ ...original, ssoConfig: config });
  const callback = (
    code: string,
    redirectUrl = "https://app.example/callback",
    client = "app",
    cookie?: string,
  ) =>
    f.request(
      `/sso/callback?${new URLSearchParams({ code, redirectUrl, client })}`,
      cookie ? { headers: { Cookie: cookie } } : undefined,
    );
  return {
    ...f,
    received,
    external,
    callback,
    config,
    async close() {
      await server.stop(true);
      await f.close();
    },
  };
}

test("business-host managed callback preserves custom query, controls protocol parameters and delivers ORCAS", async () => {
  const f = await managedFixture();
  try {
    f.setClient({ ...f.getClient(), ssoConfig: {
      ...f.config,
      callbackEndpoint: "https://business.example:8443/login/finish?tenant=fixed&client=wrong&code=wrong&redirectUrl=wrong&state=wrong",
    } });
    const authorized = await f.request("/sso/authorize?client=app&redirectUrl=https://app.example/callback", {
      headers: { Cookie: `global_session=${f.root}` },
    });
    expect(authorized.status).toBe(302);
    const callback = new URL(authorized.headers.get("Location")!);
    expect(callback.origin).toBe("https://business.example:8443");
    expect(callback.searchParams.get("tenant")).toBe("fixed");
    expect(callback.searchParams.get("client")).toBe("app");
    expect(callback.searchParams.get("redirectUrl")).toBe("https://app.example/callback");
    expect(callback.searchParams.has("state")).toBe(false);
    const delivered = await f.request(`/sso/callback${callback.search}`);
    expect(delivered.status).toBe(302);
    expect(f.received).toHaveLength(1);
    expect(delivered.headers.getSetCookie()).toHaveLength(2);
    const destination = new URL(delivered.headers.get("Location")!);
    expect(destination.searchParams.has("state")).toBe(false);
    const use = await f.use(destination.searchParams.get("token")!);
    expect(use.status).toBe(200);
  }
  finally {
    await f.close();
  }
});

test.each(["managed", "business"])("%s Token can logout after callback classification changes", async (purpose) => {
  const f = await managedFixture(false);
  try {
    const businessConfig = { ...f.config, callbackType: ClientSsoCallbackType.Business, callbackEndpoint: "https://app.example/callback" };
    if (purpose === "business")
      f.setClient({ ...f.getClient(), ssoConfig: businessConfig });
    const code = await f.authorize();
    const response = purpose === "managed" ? await f.callback(code) : await f.exchange(code);
    const token = purpose === "managed"
      ? new URL(response.headers.get("Location")!).searchParams.get("token")!
      : (await response.json()).data.sid;
    f.setClient({ ...f.getClient(), ssoConfig: purpose === "managed" ? businessConfig : f.config });
    const logout = await f.request(`/sso/logout?${new URLSearchParams({ token, redirectUrl: "https://app.example/logout" })}`);
    expect(logout.status).toBe(302);
    const used = await f.use(token);
    expect(used.status).toBe(401);
  }
  finally {
    await f.close();
  }
});

test("pre-upgrade business Codes on the managed path keep their original exchange and Token purpose", async () => {
  const f = await managedFixture(false);
  try {
    f.setClient({ ...f.getClient(), ssoConfig: { ...f.config, callbackEndpoint: "https://business.example/sso/callback" } });
    const code = await f.authorize();
    // The unchanged state format can contain Codes issued by the old origin classifier.
    await f.codes.replaceCode("app", code, { redeemer: "business" });
    const wrongEndpoint = await f.callback(code);
    expect(wrongEndpoint.status).not.toBe(302);
    const issued = await f.exchange(code);
    expect(issued.status).toBe(200);
    const token = (await issued.json()).data.sid;
    const stored = await f.codes.inspectToken(token);
    expect(stored?.record.purpose).toBe("business");
    const used = await f.use(token);
    expect(used.status).toBe(200);
    const fresh = await f.authorize();
    const freshCode = await f.codes.inspectCode("app", fresh);
    expect(freshCode?.redeemer).toBe("managed");
    const delivered = await f.callback(fresh);
    expect(delivered.status).toBe(302);
    const logout = await f.request(`/sso/logout?${new URLSearchParams({ token, redirectUrl: "https://app.example/logout" })}`);
    expect(logout.status).toBe(302);
  }
  finally {
    await f.close();
  }
});

test("managed concurrent callbacks have one external delivery and keep the winner usable", async () => {
  const f = await managedFixture();
  try {
    const code = await f.authorize();
    const target = await f.target(code);
    const results = await Promise.all([f.callback(code), f.callback(code)]);
    const winner = results.find(response => response.status === 302);
    expect(results.filter(response => response.status === 302)).toHaveLength(1);
    expect(f.received).toHaveLength(1);
    const relationship = await f.scope.inspect(target);
    expect(relationship.record?.state).toBe("active");
    const bearer = new URL(winner!.headers.get("location")!).searchParams.get("token")!;
    const use = await f.use(bearer, "app", true);
    expect(use.status).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("managed unknown Token save with failed compensation leaves explicit residual without shared-instance termination", async () => {
  const f = await managedFixture();
  try {
    const code = await f.authorize();
    const target = await f.target(code);
    f.codes.afterAction("saveToken", async () => {
      f.codes.failAction("removeToken");
      throw new Error("Saved Token response lost");
    });
    const response = await f.callback(code);
    expect(response.status).toBe(503);
    expect(response.headers.get("X-IAM-Code-Consumption")).toBe("consumed");
    expect(response.headers.get("X-IAM-Token-Compensation")).toBe("unknown");
    expect(response.headers.get("set-cookie")).toBeNull();
    const inventory = await f.codes.tokenInventory();
    const relationship = await f.scope.inspect(target);
    expect(inventory).toHaveLength(1);
    expect(relationship.record?.state).toBe("active");
    expect(f.received).toHaveLength(1);
    const replay = await f.callback(code);
    expect(replay.status).not.toBe(302);
    expect(f.received).toHaveLength(1);
  }
  finally {
    await f.close();
  }
});

test("managed Gateway consumes real published old Facts without SQL or ORCAS-specific fields", async () => {
  const f = await businessFixture(30, process.env.IAM_API_TEST_REDIS_URL);
  try {
    f.setClient({
      ...f.getClient(),
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        callbackEndpoint: "https://iam.example/sso/callback",
        validRedirectUrls: ["https://app.example/callback"],
        subjectClaims: [
          SubjectClaim.SubjectIdentifier,
          SubjectClaim.ProfileName,
          SubjectClaim.ProfileUsername,
        ],
      },
    });
    const code = await f.authorize();
    const response = await f.request(
      `/sso/callback?${new URLSearchParams({ code, client: f.businessClientCode, redirectUrl: "https://app.example/callback" })}`,
    );
    expect(response.status).toBe(302);
    const bearer = new URL(response.headers.get("location")!).searchParams.get("token")!;
    const used = await f.use(bearer, f.businessClientCode, true);
    expect(used.status).toBe(200);
    expect(JSON.parse(Buffer.from(used.headers.get("X-User-Info")!, "base64").toString())).toEqual({
      version: 1,
      subjectIdentifier: f.subjectIdentifier,
      username: "138550",
      name: "已发布资料",
    });
    expect(f.sourceCounts.factsSql).toBe(0);
    expect(f.state.orcasUserReads).toBe(0);
  }
  finally {
    await f.close();
  }
});

test("managed real HTTP delivery preserves Cookie attributes, Token lifetime, bound state and URL bearer without root Cookie authentication", async () => {
  const f = await managedFixture();
  try {
    const authorized = await f.request(
      `/sso/authorize?${new URLSearchParams({ client: "app", redirectUrl: "https://app.example/callback", state: "original-state" })}`,
      { headers: { Cookie: `global_session=${f.root}` } },
    );
    const code = new URL(authorized.headers.get("location")!).searchParams.get("code")!;
    f.setClient({
      ...f.getClient(),
      ssoConfig: { ...f.config, validRedirectUrls: ["https://changed.example/"] },
    });
    const response = await f.callback(code, undefined, undefined, "global_session=unrelated-root");
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://app.example/callback");
    expect(location.searchParams.get("state")).toBe("original-state");
    expect(location.searchParams.get("orcasToken")).toBe("external-session");
    const token = location.searchParams.get("token")!;
    const stored = await f.codes.inspectToken(token);
    expect(stored?.record.purpose).toBe("managed");
    expect(token).not.toBe(code.split(".")[2]);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
      expect(cookie).not.toContain("Secure");
      const ttl = Number(/Max-Age=(\d+)/u.exec(cookie)![1]);
      expect(ttl).toBeLessThanOrEqual(45);
      expect(ttl).toBeGreaterThanOrEqual(stored!.remainingSeconds);
    }
    expect(f.received).toEqual([{ id: 1001, username: "138550", name: "测试用户", mobile: "17721462865" }]);
    expect(f.state.factsReads).toBe(0);
    expect(JSON.stringify(stored)).not.toContain("external-");
    expect(f.audits.some(audit => audit.action === "auth.login.local")).toBe(true);
    const replay = await f.callback(code);
    expect(replay.status).not.toBe(302);
    expect(f.received).toHaveLength(1);
    const used = await f.use(token, "app", true);
    expect(used.status).toBe(200);
  }
  finally {
    await f.close();
  }
});

for (const failure of [
  "business-edit",
  "callback",
  "redirect",
  "client",
  "purpose",
  "missing",
  "corrupt",
  "consume-before",
  "consume-after",
  "permission",
  "snapshot",
]) {
  test(`managed ${failure} rejects without ORCAS, signing or shared-instance revocation`, async () => {
    const f = await managedFixture();
    try {
      if (failure === "business-edit") {
        f.setClient({
          ...f.getClient(),
          ssoConfig: { ...f.config, callbackEndpoint: "https://app.example/callback" },
        });
      }
      const code = await f.authorize();
      const target = await f.target(code);
      let submitted = code;
      if (failure === "business-edit")
        f.setClient({ ...f.getClient(), ssoConfig: f.config });
      if (failure === "callback")
        await f.codes.replaceCode("app", code, { callbackEndpoint: "https://iam.example/other" });
      if (failure === "purpose")
        await f.codes.replaceCode("app", code, { redeemer: "business" });
      if (failure === "missing")
        submitted = `${"x".repeat(43)}.${code.split(".").slice(1).join(".")}`;
      if (failure === "corrupt")
        await f.codes.corruptCode("app", code);
      if (failure.startsWith("consume-"))
        f.codes.failAction("consume", failure === "consume-after");
      if (failure === "permission")
        f.state.permission = "unknown";
      if (failure === "snapshot")
        f.state.clientUnavailable = true;
      const response = await f.callback(
        submitted,
        failure === "redirect" ? "https://evil.example/" : undefined,
        failure === "client" ? "other" : "app",
      );
      expect(response.status).not.toBe(302);
      expect(response.headers.get("X-IAM-Client-Session-Revocation")).toBeNull();
      expect(response.headers.get("X-IAM-Token-Compensation")).toBe("not_attempted");
      expect(response.headers.get("X-IAM-Code-Consumption")).toBe(
        failure.startsWith("consume-")
          ? "unknown"
          : failure === "missing" || failure === "client"
            ? "missing"
            : failure === "corrupt"
              ? "corrupt"
              : "not_attempted",
      );
      expect(f.received).toEqual([]);
      expect(f.state.orcasUserReads).toBe(0);
      const inventory = await f.codes.tokenInventory();
      const relationship = await f.scope.inspect(target);
      expect(inventory).toEqual([]);
      expect(relationship.record?.state).toBe("active");
      if (failure !== "corrupt") {
        const record = await f.codes.inspectCode("app", code);
        expect(record === null).toBe(failure === "consume-after");
      }
    }
    finally {
      await f.close();
    }
  });
}

for (const failure of [
  "user-projection",
  "orcas-reject",
  "orcas-response-lost",
  "save-before",
  "save-after",
]) {
  test(`managed consumed ${failure} requires new authorization and never replays external success`, async () => {
    const f = await managedFixture();
    try {
      const code = await f.authorize();
      const target = await f.target(code);
      f.state.orcasUserMissing = failure === "user-projection";
      f.state.orcasResponseLost = failure === "orcas-response-lost";
      f.external.reject = failure === "orcas-reject";
      if (failure.startsWith("save-"))
        f.codes.failAction("saveToken", failure === "save-after");
      const failed = await f.callback(code);
      expect(failed.status).not.toBe(302);
      expect(failed.headers.get("X-IAM-Code-Consumption")).toBe("consumed");
      expect(failed.headers.get("X-IAM-Token-Compensation")).toBe(
        failure === "save-after" ? "removed" : failure === "save-before" ? "missing" : "not_attempted",
      );
      const inventory = await f.codes.tokenInventory();
      const record = await f.codes.inspectCode("app", code);
      const relationship = await f.scope.inspect(target);
      expect(inventory).toEqual([]);
      expect(record).toBeNull();
      expect(relationship.record?.state).toBe("active");
      const externalEffects = f.received.length;
      const replay = await f.callback(code);
      expect(replay.status).not.toBe(302);
      expect(f.received).toHaveLength(externalEffects);
      f.state.orcasUserMissing = false;
      f.state.orcasResponseLost = false;
      f.external.reject = false;
      const fresh = await f.authorize();
      expect(fresh).not.toBe(code);
      expect(fresh.split(".")[2]).toBe(code.split(".")[2]);
      const delivered = await f.callback(fresh);
      expect(delivered.status).toBe(302);
      expect(f.received).toHaveLength(externalEffects + 1);
    }
    finally {
      await f.close();
    }
  });
}

for (const compensationFails of [false, true]) {
  test(`managed delivery failure keeps shared relationship and reports Token compensation ${compensationFails ? "residual" : "removed"}`, async () => {
    const f = await managedFixture(false);
    try {
      const code = await f.authorize();
      const target = await f.target(code);
      let issued = "";
      let failure: unknown;
      try {
        await f.operations.run(operation =>
          f
            .customAccess!
            .forOperation(operation)
            .completeCallback(
              { code, clientCode: "app", redirectUrl: "https://app.example/callback" },
              (result) => {
                issued = result.token;
                if (compensationFails)
                  f.codes.failAction("removeToken");
                throw new Error("Response serialization failed");
              },
            ),
        );
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(CustomSsoManagedFailure);
      expect(failure).toMatchObject({
        consumption: "consumed",
        tokenCompensation: compensationFails ? "unknown" : "removed",
      });
      const token = await f.codes.inspectToken(issued);
      const relationship = await f.scope.inspect(target);
      expect(token !== null).toBe(compensationFails);
      expect(relationship.record?.state).toBe("active");
      const residualUse = await f.use(issued, "app", true);
      expect(residualUse.status).toBe(compensationFails ? 200 : 401);
      const oldCode = await f.callback(code);
      expect(oldCode.status).not.toBe(302);
      const fresh = await f.authorize();
      expect(fresh.split(".")[2]).toBe(code.split(".")[2]);
      const response = await f.callback(fresh);
      expect(response.status).toBe(302);
      expect(f.received).toEqual([]);
      expect(f.state.orcasUserReads).toBe(0);
    }
    finally {
      await f.close();
    }
  });
}

test("managed Gateway dynamically trims published facts and preserves temporary Cookies; root, instance and account remain authoritative", async () => {
  const f = await managedFixture(false);
  try {
    f.state.gatewayAuditFails = true;
    const code = await f.authorize();
    const target = await f.target(code);
    const delivered = await f.callback(code);
    expect(delivered.status).toBe(302);
    const token = new URL(delivered.headers.get("location")!).searchParams.get("token")!;
    const cookie = delivered.headers.getSetCookie()[0]!.split(";")[0]!;
    const useCookie = () =>
      f.request("/auth/authz", { headers: { "Client": "app", "X-Forwarded-Uri": "/home", "Cookie": cookie } });
    const full = await useCookie();
    expect(JSON.parse(Buffer.from(full.headers.get("X-User-Info")!, "base64").toString())).toEqual({
      version: 1,
      subjectIdentifier: f.subjectIdentifier,
      name: "已发布资料",
    });
    f.setClient({
      ...f.getClient(),
      ssoConfig: { ...f.config, subjectClaims: [SubjectClaim.SubjectIdentifier] },
    });
    const reads = f.state.factsReads;
    const minimal = await useCookie();
    expect(JSON.parse(Buffer.from(minimal.headers.get("X-User-Info")!, "base64").toString())).toEqual({
      version: 1,
      subjectIdentifier: f.subjectIdentifier,
    });
    expect(f.state.factsReads).toBe(reads);
    f.setClient({ ...f.getClient(), ssoConfig: f.config });
    f.duringFacts(async () => {
      throw new SubjectAccessUnavailableError();
    });
    const factsFailure = await useCookie();
    expect(factsFailure.status).toBe(503);
    expect(factsFailure.headers.get("set-cookie")).toBeNull();
    f.duringFacts(async () => {});
    f.state.clientUnavailable = true;
    const snapshotFailure = await useCookie();
    expect(snapshotFailure.status).toBe(503);
    expect(snapshotFailure.headers.get("set-cookie")).toBeNull();
    f.state.clientUnavailable = false;
    f.setClient({ ...f.getClient(), ssoEnabled: false });
    const paused = await useCookie();
    expect(paused.status).not.toBe(200);
    f.setClient({ ...f.getClient(), ssoEnabled: true });
    const restored = await useCookie();
    expect(restored.status).toBe(200);
    f.state.permission = "unknown";
    const unknown = await useCookie();
    expect(unknown.status).toBe(503);
    expect(unknown.headers.get("set-cookie")).toBeNull();
    f.state.permission = "enabled";
    f.state.generation = randomUUID();
    const stale = await useCookie();
    expect(stale.status).not.toBe(200);
    const terminated = await f.scope.inspect(target);
    expect(terminated.record?.state).toBe("terminated");
    const freshRoot = await f.login();
    const freshCode = await f.authorize("app", freshRoot);
    const freshDelivery = await f.callback(freshCode);
    const freshToken = new URL(freshDelivery.headers.get("location")!).searchParams.get("token")!;
    await f.scope.forgetChildIndex(freshCode.split(".")[1]!);
    await f.operations.run(operation => f.roots.forOperation(operation).logout(freshRoot));
    const afterRoot = await f.use(freshToken, "app", true);
    expect(afterRoot.status).toBe(401);
    const old = await f.use(token, "app", true);
    expect(old.status).not.toBe(200);
  }
  finally {
    await f.close();
  }
});

test("business exchange consumes its Code and delivers the fixed-purpose bearer", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const response = await f.exchange(code);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.sid).toMatch(/^cs_/u);
    expect(data.sid).not.toBe(code.split(".")[2]);
    expect(data.ttl).toBeGreaterThan(0);
    const before = await f.codes.inspectToken(data.sid);
    expect(before?.record.purpose).toBe("business");
    expect(await f.codes.inspectCode("app", code)).toBeNull();
    const info = await f.use(data.sid);
    expect(info.status).toBe(200);
    expect((await info.json()).data.profile.name).toBe("已发布资料");
  }
  finally {
    await f.close();
  }
});

test("SSO disablement pauses Token use and re-enablement restores the same Token", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const response = await f.exchange(code);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const initial = f.getClient();
    f.setClient({ ...initial, ssoEnabled: false });
    const paused = await f.use(data.sid);
    expect(paused.status).not.toBe(200);
    f.setClient(initial);
    const resumed = await f.use(data.sid);
    expect(resumed.status).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("current sub-only disclosure trims UserInfo and Gateway output without reading Facts", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const response = await f.exchange(code);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const initial = f.getClient();
    const minimal = {
      protocol: ClientSsoProtocol.CustomSso,
      callbackType: ClientSsoCallbackType.Business,
      callbackEndpoint: "https://app.example/callback",
      validRedirectUrls: ["https://app.example/callback"],
      subjectClaims: [SubjectClaim.SubjectIdentifier],
    } as const;
    f.setClient({
      ...initial,
      ssoConfig: {
        ...minimal,
        validRedirectUrls: [...minimal.validRedirectUrls],
        subjectClaims: [...minimal.subjectClaims],
      },
    });
    const reads = f.state.factsReads;
    const minimalResponse = await f.use(data.sid);
    expect((await minimalResponse.json()).data).toEqual({
      version: 2,
      subjectIdentifier: f.subjectIdentifier,
    });
    const authz = await f.use(data.sid, "app", true);
    expect(JSON.parse(Buffer.from(authz.headers.get("X-User-Info")!, "base64").toString())).toEqual({
      version: 1,
      subjectIdentifier: f.subjectIdentifier,
    });
    expect(f.state.factsReads).toBe(reads);
  }
  finally {
    await f.close();
  }
});

test("another authorization does not extend an existing business Token", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const response = await f.exchange(code);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const before = await f.codes.inspectToken(data.sid);
    await f.authorize();
    expect((await f.codes.inspectToken(data.sid))?.record).toEqual(before?.record);
  }
  finally {
    await f.close();
  }
});

test("a wrong Client cannot use a business Token or invalidate its rightful use", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const response = await f.exchange(code);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const wrong = await f.use(data.sid, "other");
    expect(wrong.status).not.toBe(200);
    expect((await f.use(data.sid)).status).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("business authentication and location rejection leave Code and exact relationship untouched", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const target = await f.target(code);
    const original = await f.codes.inspectCode("app", code);
    for (const [submitted, secret, client] of [
      [code, "wrong", "app"],
      [code, "unknown", "app"],
      ["malformed", "business-secret", "app"],
      [code, "business-secret", "other"],
      [`${code.split(".")[0]}.${randomUUID()}.${code.split(".")[2]}`, "business-secret", "app"],
    ]) {
      const response = await f.exchange(submitted!, secret!, "", "https://app.example/callback", client!);
      expect(response.status).not.toBe(200);
      expect(response.headers.get("X-IAM-Client-Session-Revocation")).toBeNull();
      expect((await f.scope.inspect(target)).record?.state).toBe("active");
      expect(await f.codes.inspectCode("app", code)).toEqual(original);
    }
  }
  finally {
    await f.close();
  }
});

for (const failure of [
  "missing",
  "query",
  "redirect",
  "maintenance",
  "snapshot",
  "disabled",
  "protocol",
  "callback",
  "purpose",
  "permission",
  "corrupt",
  "read-unknown",
  "consume-before",
  "consume-after",
  "projection",
  "save-before",
  "save-after",
] as const) {
  test(`business HTTP post-location ${failure} reports independent consumption/revocation and preserves unrelated sessions`, async () => {
    const f = await businessFixture();
    try {
      const code = await f.authorize();
      const other = await f.authorize("other");
      const target = await f.target(code);
      const otherTarget = await f.target(other, "other");
      const initial = f.getClient();
      let submitted = code;
      if (failure === "missing")
        submitted = `${"x".repeat(43)}.${code.split(".").slice(1).join(".")}`;
      if (failure === "maintenance")
        f.setClient({ ...initial, status: ClientStatus.Maintenance });
      if (failure === "snapshot")
        f.state.clientUnavailable = true;
      if (failure === "disabled")
        f.setClient({ ...initial, ssoEnabled: false });
      if (failure === "protocol")
        f.setClient({ ...initial, ssoConfig: null });
      if (failure === "callback" || failure === "purpose") {
        await f.codes.replaceCode(
          "app",
          code,
          failure === "callback"
            ? { callbackEndpoint: "https://other.example/callback" }
            : { redeemer: "managed" },
        );
      }
      if (failure === "permission")
        f.state.permission = "unknown";
      if (failure === "corrupt")
        await f.codes.corruptCode("app", code);
      if (failure === "read-unknown")
        f.codes.failNext();
      if (failure === "consume-before" || failure === "consume-after")
        f.codes.failAction("consume", failure === "consume-after");
      if (failure === "projection") {
        f.duringFacts(async () => {
          throw new Error("projection failed");
        });
      }
      if (failure === "save-before" || failure === "save-after")
        f.codes.failAction("saveToken", failure === "save-after");
      const response = await f.exchange(
        submitted,
        "business-secret",
        failure === "query" ? "?token=bad" : "",
        failure === "redirect" ? "https://other.example/" : "https://app.example/callback",
      );
      expect(response.status).not.toBe(200);
      expect(response.headers.get("X-IAM-Client-Session-Revocation")).toBe("terminated");
      const consumption = response.headers.get("X-IAM-Code-Consumption");
      expect(consumption).toBe(
        ["projection", "save-before", "save-after"].includes(failure)
          ? "consumed"
          : failure.startsWith("consume-") || failure === "read-unknown"
            ? "unknown"
            : failure === "missing"
              ? "missing"
              : failure === "corrupt"
                ? "corrupt"
                : "not_attempted",
      );
      expect((await f.scope.inspect(target)).record?.state).toBe("terminated");
      expect((await f.scope.inspect(otherTarget)).record?.state).toBe("active");
      expect(await f.codes.tokenInventory()).toEqual([]);
      if (failure !== "corrupt") {
        const stored = await f.codes.inspectCode("app", code);
        expect(stored === null).toBe(
          ["consume-after", "projection", "save-before", "save-after"].includes(failure),
        );
      }
      f.setClient(initial);
      f.state.clientUnavailable = false;
      f.state.permission = "enabled";
      const fresh = await f.authorize();
      expect(fresh.split(".")[2]).not.toBe(code.split(".")[2]);
      expect((await f.scope.inspect(target)).record?.state).toBe("terminated");
    }
    finally {
      await f.close();
    }
  });
}

test("concurrent business exchange has one consumer; missing loser terminates original and late winner Token is denied", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    let release!: () => void;
    let consumed!: () => void;
    const consumedSignal = new Promise<void>((resolve) => {
      consumed = resolve;
    });
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.codes.afterAction("consume", async () => {
      consumed();
      await pause;
    });
    const winner = f.exchange(code);
    await consumedSignal;
    const loser = await f.exchange(code);
    expect(loser.headers.get("X-IAM-Code-Consumption")).toBe("missing");
    expect(loser.headers.get("X-IAM-Client-Session-Revocation")).toBe("terminated");
    release();
    const won = await winner;
    expect(won.status).toBe(200);
    const { data } = await won.json();
    expect(await f.codes.inspectToken(data.sid)).not.toBeNull();
    expect((await f.use(data.sid)).status).not.toBe(200);
    expect((await f.use(data.sid, "app", true)).status).not.toBe(200);
  }
  finally {
    await f.close();
  }
});

test("root termination denies Token even with missing child index; other root and later instance survive", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const { data } = await (await f.exchange(code)).json();
    const otherRoot = await f.login();
    const otherCode = await f.authorize("app", otherRoot);
    const other = await (await f.exchange(otherCode)).json();
    await f.scope.forgetChildIndex(code.split(".")[1]!);
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.resolveUserSession(f.root);
      if (root.status !== "resolved")
        throw new Error("root missing");
      const result = await sessions.revokeObservedUserSession(root.value);
      expect(result.status).toBe("terminated");
    });
    expect((await f.use(data.sid)).status).not.toBe(200);
    expect((await f.use(other.data.sid)).status).toBe(200);
  }
  finally {
    await f.close();
  }
});

for (const after of [false, true]) {
  test(`business revocation ${after ? "unknown committed" : "failed before write"} is distinct from burned Code and failed Token compensation`, async () => {
    const f = await businessFixture();
    try {
      const code = await f.authorize();
      const target = await f.target(code);
      f.codes.afterAction("saveToken", async () => {
        f.scope.failNext("revoke", after);
        f.codes.failAction("removeToken");
      });
      let failure: unknown;
      try {
        await f.operations.run(operation =>
          f
            .customAccess!
            .forOperation(operation)
            .exchange(
              {
                clientCode: "app",
                clientSecret: "business-secret",
                code,
                redirectUri: "https://app.example/callback",
              },
              () => {
                throw new Error("delivery failed");
              },
            ),
        );
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({
        consumption: "consumed",
        revocation: { status: "unknown" },
        tokenCompensation: "unknown",
      });
      expect(await f.codes.inspectCode("app", code)).toBeNull();
      const inventory = await f.codes.tokenInventory();
      expect(inventory).toHaveLength(1);
      expect((await f.scope.inspect(target)).record?.state).toBe(after ? "terminated" : "active");
      const report = await f.codes.maintenance.apply({ clientCode: "app", limit: 1000 });
      expect(report.removed).toBe(1);
      expect(report.unknown).toBe(0);
      const verification = await f.codes.independentInventory();
      expect(verification.matching).toBe(0);
    }
    finally {
      await f.close();
    }
  });
}

test("owner maintenance finds unindexed/no-TTL token and preserves another Client and malformed Code", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const token = await (await f.exchange(code)).json();
    const otherCode = await f.authorize("other");
    const other = await (
      await f.exchange(otherCode, "business-secret", "", "https://app.example/callback", "other")
    ).json();
    const malformed = await f.authorize();
    await f.codes.corruptCode("app", malformed);
    await f.codes.removeTokenIndex(token.data.sid);
    await f.codes.removeTokenTtl(token.data.sid);
    const report = await f.codes.maintenance.apply({ clientCode: "app", limit: 1000 });
    expect(report.removed).toBe(1);
    expect(report.unknown).toBe(1);
    expect((await f.use(token.data.sid)).status).not.toBe(200);
    expect((await f.use(other.data.sid, "other")).status).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("candidate complete warm HTTP endpoints reuse cached sources and record socket chunk samples", async () => {
  const upstreamUrl = new URL(process.env.IAM_API_TEST_REDIS_URL!);
  const upstreamAddress = { host: upstreamUrl.hostname, port: Number(upstreamUrl.port) };
  const observer = new Redis(upstreamUrl.toString(), { maxRetriesPerRequest: 0, retryStrategy: () => null });
  const appKeys = clientSnapshotKeys("app");
  const sentinelKeys = [appKeys.control, ...appKeys.payloads];
  const sentinelValue = `non-target:${randomUUID()}`;
  const ownedSentinels: string[] = [];
  let requestChunks = 0;
  let responseChunks = 0;
  const proxy = createServer((downstream) => {
    const upstream = connect(upstreamAddress);
    downstream.on("data", (data) => {
      requestChunks++;
      upstream.write(data);
    });
    upstream.on("data", (data) => {
      responseChunks++;
      downstream.write(data);
    });
    upstream.on("end", () => downstream.end());
    downstream.on("end", () => upstream.end());
    downstream.on("close", () => upstream.destroy());
    upstream.on("error", () => downstream.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw new Error("Missing proxy address");
  upstreamUrl.hostname = "127.0.0.1";
  upstreamUrl.port = String(address.port);
  let f: Awaited<ReturnType<typeof businessFixture>> | undefined;
  try {
    await observer.ping();
    for (const key of sentinelKeys) {
      const created = await observer.set(key, sentinelValue, "NX");
      if (created === "OK")
        ownedSentinels.push(key);
    }
    const sentinelBefore = await Promise.all(
      sentinelKeys.map(async key => ({
        value: await observer.dump(key),
        expiry: await observer.pexpiretime(key),
      })),
    );
    f = await businessFixture(30, upstreamUrl.toString());
    expect(f.businessClientCode).not.toBe("app");
    const warm = await f.authorize();
    const warmResult = await f.exchange(warm);
    expect(warmResult.status).toBe(200);
    const sourceBefore = { ...f.sourceCounts };
    const samples = [];
    for (let iteration = 0; iteration < 3; iteration++) {
      requestChunks = responseChunks = 0;
      let started = performance.now();
      const code = await f.authorize();
      const authorize = { requestChunks, responseChunks, ms: performance.now() - started };
      requestChunks = responseChunks = 0;
      started = performance.now();
      const exchanged = await f.exchange(code);
      const data = (await exchanged.json()).data;
      const exchange = { requestChunks, responseChunks, ms: performance.now() - started };
      expect(exchanged.status).toBe(200);
      requestChunks = responseChunks = 0;
      started = performance.now();
      const info = await f.use(data.sid);
      await info.text();
      const userInfo = { requestChunks, responseChunks, ms: performance.now() - started };
      expect(info.status).toBe(200);
      requestChunks = responseChunks = 0;
      started = performance.now();
      const authorized = await f.use(data.sid, f.businessClientCode, true);
      await authorized.text();
      const authz = { requestChunks, responseChunks, ms: performance.now() - started };
      expect(authorized.status).toBe(200);
      samples.push({ authorize, exchange, userInfo, authz });
    }
    expect(f.sourceCounts).toEqual(sourceBefore);
    expect(f.sourceCounts.factsSql).toBe(0);
    const report = JSON.stringify({ samples, sourceDuringSamples: { client: 0, credential: 0, factsSql: 0 } });
    process.stdout.write(`Custom candidate HTTP network samples ${report}\n`);
    await f.close();
    f = undefined;
    const sentinelAfter = await Promise.all(
      sentinelKeys.map(async key => ({
        value: await observer.dump(key),
        expiry: await observer.pexpiretime(key),
      })),
    );
    expect(sentinelAfter).toEqual(sentinelBefore);
  }
  finally {
    try {
      await f?.close();
      for (const key of ownedSentinels) {
        await observer.eval(
          "if redis.call('TYPE',KEYS[1]).ok=='string' and redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0",
          1,
          key,
          sentinelValue,
        );
      }
    }
    finally {
      observer.disconnect();
      await new Promise<void>((resolve, reject) =>
        proxy.close(error => (error ? reject(error) : resolve())),
      );
    }
  }
});

test("expired Code and unavailable original root still trigger precise post-location revocation", async () => {
  const f = await businessFixture(1);
  try {
    const code = await f.authorize();
    await Bun.sleep(1100);
    const expired = await f.exchange(code);
    expect(expired.headers.get("X-IAM-Code-Consumption")).toBe("missing");
    expect(expired.headers.get("X-IAM-Client-Session-Revocation")).toBe("terminated");
    const next = await f.authorize();
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.observeUserSessionForRevocation(next.split(".")[1]!);
      if (root.status !== "resolved")
        throw new Error("root missing");
      await sessions.revokeObservedUserSession(root.value);
    });
    const failed = await f.exchange(next);
    expect(failed.headers.get("X-IAM-Code-Consumption")).toBe("not_attempted");
    expect(failed.headers.get("X-IAM-Client-Session-Revocation")).toBe("terminated");
    expect(await f.codes.inspectCode("app", next)).not.toBeNull();
  }
  finally {
    await f.close();
  }
});

test("known corrupted revocation reports failed and synchronous Token compensation is separate", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const target = await f.target(code);
    let restore: (() => Promise<void>) | undefined;
    let failure: unknown;
    try {
      await f.operations.run(operation =>
        f
          .customAccess!
          .forOperation(operation)
          .exchange(
            {
              clientCode: "app",
              clientSecret: "business-secret",
              code,
              redirectUri: "https://app.example/callback",
            },
            async () => {
              restore = await f.scope.corruptRecord(target);
              throw new Error("delivery failed");
            },
          ),
      );
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      consumption: "consumed",
      revocation: { status: "failed" },
      tokenCompensation: "removed",
    });
    expect(await f.codes.tokenInventory()).toEqual([]);
    await restore?.();
    expect((await f.scope.inspect(target)).record?.state).toBe("active");
  }
  finally {
    await f.close();
  }
});

test("new protocol marker does not invalidate old Token, but protocol selection and account generation independently gate use", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const { data } = await (await f.exchange(code)).json();
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.resolveUserSession(f.root);
      if (root.status !== "resolved")
        throw new Error("root missing");
      const opened = await sessions.openClientSession(root.value, { clientId: "app", protocol: "oidc" });
      expect(opened.status).toBe("reused");
    });
    expect((await f.use(data.sid)).status).toBe(200);
    const initial = f.getClient();
    f.setClient({
      ...initial,
      ssoConfig: {
        protocol: ClientSsoProtocol.Oidc,
        clientType: OidcClientType.Public,
        redirectUris: ["https://app.example/callback"],
        postLogoutRedirectUris: [],
        allowedScopes: [OidcScope.OpenId],
      },
    });
    expect((await f.use(data.sid)).status).not.toBe(200);
    f.setClient(initial);
    expect((await f.use(data.sid)).status).toBe(200);
    f.state.permission = "disabled";
    expect((await f.use(data.sid)).status).not.toBe(200);
    f.state.permission = "enabled";
    f.state.generation = randomUUID();
    expect((await f.use(data.sid)).status).not.toBe(200);
    const newRoot = await f.login();
    const newCode = await f.authorize("app", newRoot);
    const newToken = await (await f.exchange(newCode)).json();
    expect((await f.use(newToken.data.sid)).status).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("business failure effect deadline reports unknown without retrying or blocking forever", async () => {
  const f = await businessFixture();
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const code = await f.authorize();
    const target = await f.target(code);
    f.scope.afterNext("revoke", () => pause);
    const response = await f.exchange(code, "business-secret", "?bad=parameter");
    expect(response.headers.get("X-IAM-Client-Session-Revocation")).toBe("unknown");
    expect(response.headers.get("X-IAM-Code-Consumption")).toBe("not_attempted");
    expect((await f.scope.inspect(target)).record?.state).toBe("terminated");
    release();
    const fresh = await f.authorize();
    expect(fresh.split(".")[2]).not.toBe(code.split(".")[2]);
  }
  finally {
    release();
    await f.close();
  }
});

test("protocol token expiry is not extended by authorization; malformed and unavailable token state fail closed without session revocation", async () => {
  const f = await businessFixture(30, undefined, 1);
  try {
    const code = await f.authorize();
    const { data } = await (await f.exchange(code)).json();
    const target = await f.target(code);
    await f.authorize();
    await Bun.sleep(1100);
    const expired = await f.use(data.sid);
    expect(expired.status).not.toBe(200);
    expect(await f.codes.inspectToken(data.sid)).toBeNull();
    expect((await f.scope.inspect(target)).record?.state).toBe("active");
    const next = await f.authorize();
    const nextToken = await (await f.exchange(next)).json();
    f.codes.failNext();
    expect((await f.use(nextToken.data.sid)).status).toBe(503);
    await f.codes.corruptToken(nextToken.data.sid);
    expect((await f.use(nextToken.data.sid)).status).toBe(503);
    expect((await f.scope.inspect(target)).record?.state).toBe("active");
  }
  finally {
    await f.close();
  }
});

test("splicing another Code ID never consumes the other Client or original instance record", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    const other = await f.authorize("other");
    const otherRecord = await f.codes.inspectCode("other", other);
    const forged = `${other.split(".")[0]}.${code.split(".").slice(1).join(".")}`;
    const response = await f.exchange(forged);
    expect(response.headers.get("X-IAM-Code-Consumption")).toBe("missing");
    expect(response.headers.get("X-IAM-Client-Session-Revocation")).toBe("terminated");
    expect(await f.codes.inspectCode("other", other)).toEqual(otherRecord);
    expect(await f.codes.inspectCode("app", code)).not.toBeNull();
    expect(
      (await f.exchange(other, "business-secret", "", "https://app.example/callback", "other")).status,
    ).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("Code replacement after validation is not consumed and failure revokes only the captured original instance", async () => {
  const f = await businessFixture();
  try {
    const code = await f.authorize();
    f.scope.afterNext("resolveClient", async () => {
      f.scope.afterNext("resolveClient", async () => {
        await f.codes.replaceCode("app", code, { state: "changed" });
      });
    });
    const response = await f.exchange(code);
    expect(response.headers.get("X-IAM-Code-Consumption")).toBe("changed");
    expect(response.headers.get("X-IAM-Client-Session-Revocation")).toBe("terminated");
    expect((await f.codes.inspectCode("app", code))?.state).toBe("changed");
    const fresh = await f.authorize();
    const freshTarget = await f.target(fresh);
    const repeated = await f.exchange(code);
    expect(repeated.headers.get("X-IAM-Client-Session-Revocation")).toBe("already_terminated");
    expect((await f.scope.inspect(freshTarget)).record?.state).toBe("active");
  }
  finally {
    await f.close();
  }
});

test("maintenance inventory carries SCAN overflow without exceeding the per-page work budget", async () => {
  const f = await businessFixture();
  try {
    const consumed = await f.authorize();
    expect((await f.exchange(consumed)).status).toBe(200);
    await f.authorize();
    await f.authorize();
    let cursor = "0";
    let matching = 0;
    let pages = 0;
    do {
      const page = await f.codes.maintenance.inventory({ cursor, limit: 1, clientCode: "app" });
      expect(page.matching).toBeLessThanOrEqual(1);
      expect(page.unknown).toBe(0);
      matching += page.matching;
      cursor = page.nextCursor;
      pages++;
      expect(pages).toBeLessThan(30);
    } while (cursor !== "0");
    expect(matching).toBe(3);
  }
  finally {
    await f.close();
  }
});

test("every retained Public endpoint uses the same root and Custom authentication before business work", async () => {
  const f = await businessFixture();
  try {
    const issued = await f.exchange(await f.authorize());
    const token = (await issued.json()).data.sid;
    const endpoints = [
      { path: "/orcasId", body: undefined },
      { path: "/password/change", body: { oldPassword: "old", newPassword: "new" } },
      { path: "/mobile/set", body: { phoneNumber: "17721462865", code: "1234" } },
      { path: "/organizations/search", body: {} },
      { path: "/users/search", body: {} },
    ];
    for (const client of ["iam", "app"]) {
      for (const endpoint of endpoints) {
        const init = {
          method: endpoint.body ? "POST" : "GET",
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
          headers: {
            "Client": client,
            "Content-Type": "application/json",
            "Authorization": client === "iam" ? f.root : token,
          },
        };
        const allowed = await f.request(`/public${endpoint.path}`, init);
        expect(allowed.status).toBe(200);
        const calls = f.state.publicBusinessReads;
        const invalid = await f.request(`/public${endpoint.path}`, {
          ...init,
          headers: { ...init.headers, Authorization: "invalid" },
        });
        expect(invalid.status).toBe(401);
        expect(f.state.publicBusinessReads).toBe(calls);
      }
    }
    expect(f.state.publicBusinessReads).toBe(8);
  }
  finally {
    await f.close();
  }
});

for (const auditFails of [false, true]) {
  test(`business HTTP success records correlated local login; audit failure only warns (${auditFails})`, async () => {
    const f = await businessFixture();
    try {
      f.state.businessAuditFails = auditFails;
      const code = await f.authorize();
      const traceId = "1234567890abcdef1234567890abcdef";
      const response = await f.request("/sso/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from("app:business-secret").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Request-Id": "independent-login",
          "traceparent": `00-${traceId}-1234567890abcdef-01`,
        },
        body: new URLSearchParams({ code, redirect_uri: "https://app.example/callback" }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      const usage = await f.use(body.data.sid);
      expect(usage.status).toBe(200);
      if (auditFails) {
        expect(f.warnings).toContainEqual(
          expect.objectContaining({
            operation: "independent_login_audit",
            outcome: "audit_failed",
            clientCode: "app",
            requestId: "independent-login",
            traceId,
          }),
        );
      }
      else {
        expect(f.audits).toContainEqual(
          expect.objectContaining({
            action: "auth.login.local",
            outcome: "success",
            targetCode: f.subjectIdentifier,
            requestId: "independent-login",
            traceId,
            details: { clientCode: "app", loginType: "local", mode: "independent" },
          }),
        );
      }
      expect(JSON.stringify(f.warnings)).not.toContain(body.data.sid);
      expect(JSON.stringify(f.audits)).not.toContain(body.data.sid);
    }
    finally {
      await f.close();
    }
  });
}

for (const permission of ["disabled", "unknown"]) {
  test(`query application Token logout terminates its original root without Subject Access (${permission})`, async () => {
    const f = await businessFixture();
    try {
      const code = await f.authorize();
      const response = await f.exchange(code);
      const body = await response.json();
      const otherRoot = await f.login();
      f.state.permission = permission;
      const before = f.state.permissionReads;
      const logout = await f.request(
        `/sso/logout?${new URLSearchParams({ token: body.data.sid, redirectUrl: "https://app.example/logout" })}`,
      );
      expect(logout.status).toBe(302);
      expect(f.state.permissionReads).toBe(before);
      const roots = await f.operations.run(async (operation) => {
        const sessions = f.kernel.forOperation(operation);
        return {
          original: await sessions.resolveUserSession(f.root),
          other: await sessions.resolveUserSession(otherRoot),
        };
      });
      expect(roots.original.status).toBe("terminated");
      expect(roots.other.status).toBe("resolved");
    }
    finally {
      await f.close();
    }
  });
}

test("root Cookie takes precedence over query application Token during logout", async () => {
  const f = await businessFixture();
  try {
    const issued = await f.exchange(await f.authorize());
    const body = await issued.json();
    const currentRoot = await f.login();
    const response = await f.request(
      `/sso/logout?${new URLSearchParams({ token: body.data.sid, redirectUrl: "https://app.example/logout" })}`,
      { headers: { Cookie: `global_session=${currentRoot}` } },
    );
    expect(response.status).toBe(302);
    const original = await f.use(body.data.sid);
    expect(original.status).toBe(200);
    const current = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSession(currentRoot),
    );
    expect(current.status).toBe("terminated");
  }
  finally {
    await f.close();
  }
});

test("application Token logout terminates its root after the callback delivery purpose changes", async () => {
  const f = await businessFixture();
  try {
    const issued = await f.exchange(await f.authorize());
    const body = await issued.json();
    const client = f.getClient();
    if (client.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso)
      throw new Error("Expected Custom config");
    f.setClient({
      ...client,
      ssoConfig: { ...client.ssoConfig, callbackEndpoint: "https://iam.example/sso/callback" },
    });
    const response = await f.request(
      `/sso/logout?${new URLSearchParams({ token: body.data.sid, redirectUrl: "https://app.example/logout" })}`,
    );
    expect(response.status).toBe(302);
    const root = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSession(f.root),
    );
    expect(root.status).toBe("terminated");
  }
  finally {
    await f.close();
  }
});

test("managed application Token logout remains available during Client Maintenance and preserves unrelated roots", async () => {
  const f = await managedFixture(false);
  try {
    const response = await f.callback(await f.authorize());
    expect(response.status).toBe(302);
    const token = new URL(response.headers.get("location")!).searchParams.get("token")!;
    const other = await f.login();
    f.setClient({ ...f.getClient(), status: ClientStatus.Maintenance });
    f.state.permission = "disabled";
    const permissionReads = f.state.permissionReads;
    const logout = await f.request(
      `/sso/logout?${new URLSearchParams({ token, redirectUrl: "https://app.example/logout" })}`,
    );
    expect(logout.status).toBe(302);
    expect(f.state.permissionReads).toBe(permissionReads);
    const original = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSession(f.root),
    );
    const unrelated = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSession(other),
    );
    expect(original.status).toBe("terminated");
    expect(unrelated.status).toBe("resolved");
  }
  finally {
    await f.close();
  }
});

for (const gate of ["disabled", "sso-disabled"] as const) {
  test(`application Token logout preserves old Client rejection semantics (${gate})`, async () => {
    const f = await businessFixture();
    try {
      const response = await f.exchange(await f.authorize());
      const body = await response.json();
      f.setClient({
        ...f.getClient(),
        ...(gate === "disabled" ? { status: ClientStatus.Disable } : { ssoEnabled: false }),
      });
      const logout = await f.request(
        `/sso/logout?${new URLSearchParams({ token: body.data.sid, redirectUrl: "https://app.example/logout" })}`,
      );
      expect(logout.status).toBe(401);
      const root = await f.operations.run(operation =>
        f.kernel.forOperation(operation).resolveUserSession(f.root),
      );
      expect(root.status).toBe("resolved");
    }
    finally {
      await f.close();
    }
  });
}

test("application Token logout uses immutable owner and identity despite a later ClientSession protocol marker", async () => {
  const f = await businessFixture();
  try {
    const response = await f.exchange(await f.authorize());
    const body = await response.json();
    const opened = await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.resolveUserSession(f.root);
      if (root.status !== "resolved")
        throw new Error("Expected root");
      return await sessions.openClientSession(root.value, { clientId: "app", protocol: "oidc" });
    });
    expect(opened.status).toBe("reused");
    const logout = await f.request(
      `/sso/logout?${new URLSearchParams({ token: body.data.sid, redirectUrl: "https://app.example/logout" })}`,
    );
    expect(logout.status).toBe(302);
    const root = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSession(f.root),
    );
    expect(root.status).toBe("terminated");
  }
  finally {
    await f.close();
  }
});
