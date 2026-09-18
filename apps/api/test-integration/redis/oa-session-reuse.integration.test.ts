import { randomUUID } from "node:crypto";
import { expect, test } from "bun:test";
import { fixture } from "./root-authentication.fixture";

type Fixture = Awaited<ReturnType<typeof fixture>>;

function oaPath(f: Fixture, overrides: Record<string, string> = {}) {
  return `/sso/thirdparty/oa?${new URLSearchParams({
    loginid: "138550",
    ts: "1700000000000",
    token: f.oaToken,
    client: "iam",
    redirectUrl: "https://app.example/callback",
    ...overrides,
  })}`;
}

async function resolve(f: Fixture, token: string) {
  return await f.operations.run(async operation =>
    await f.kernel.forOperation(operation).resolveUserSession(token));
}

async function otherUserSession(f: Fixture) {
  return await f.operations.run(async (operation) => {
    const subjectIdentifier = randomUUID();
    const permission = await operation.acquireForAuthentication(subjectIdentifier);
    return await f.kernel.forOperation(operation).createUserSession({
      subjectIdentifier,
      subjectContext: operation.getSubjectContext(permission),
      amr: ["pwd"],
    });
  });
}

test("OA reuses the same user's valid session without renewing it or recording another login", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const before = await f.operations.run(async operation =>
      await f.kernel.forOperation(operation).resolveUserSession(token));
    const response = await f.app.request(`/sso/thirdparty/oa?${new URLSearchParams({
      loginid: "138550",
      ts: "1700000000000",
      token: f.oaToken,
      client: "iam",
      redirectUrl: "https://app.example/callback",
      state: "original-state",
    })}`, { headers: { Cookie: `global_session=${token}` } });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!, "https://iam.example");
    expect(location.pathname).toBe("/sso/authorize");
    expect(location.searchParams.get("token")).toBe(token);
    expect(location.searchParams.get("state")).toBe("original-state");
    expect(response.headers.getSetCookie()).toEqual([]);
    const after = await f.operations.run(async operation =>
      await f.kernel.forOperation(operation).resolveUserSession(token));
    expect(before.status).toBe("resolved");
    expect(after.status).toBe("resolved");
    if (before.status === "resolved" && after.status === "resolved")
      expect(after.value.userSession).toEqual(before.value.userSession);
    expect(f.audits.filter(audit => audit.action === "auth.login.oa")).toEqual([]);
    const authorized = await f.app.request(`${location.pathname}${location.search}`, {
      headers: { Cookie: `global_session=${token}` },
    });
    expect(authorized.status).toBe(302);
    expect(authorized.headers.get("location")).toStartWith("https://app.example/callback");
  }
  finally {
    await f.scope.close();
  }
});

test("OA reuses a header session and writes only its remaining lifetime into the cookie", async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const before = await resolve(f, token);
    const response = await f.app.request(oaPath(f), { headers: { Authorization: token } });
    expect(response.status).toBe(302);
    expect(f.cookie(response)).toBe(token);
    const maxAge = Number(/Max-Age=(\d+)/u.exec(response.headers.get("set-cookie")!)![1]);
    expect(before.status).toBe("resolved");
    if (before.status === "resolved") {
      expect(maxAge).toBeGreaterThan(0);
      expect(maxAge).toBeLessThanOrEqual(before.value.remainingSeconds);
    }
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(await f.scope.countRecords()).toBe(1);
    expect(f.audits.filter(audit => audit.action === "auth.login.oa")).toEqual([]);
  }
  finally {
    await f.scope.close();
  }
});

test.each([
  { failure: "signature", sameUser: true },
  { failure: "timestamp", sameUser: true },
  { failure: "signature", sameUser: false },
  { failure: "timestamp", sameUser: false },
])("OA rejects invalid $failure without terminating the current session (same user: $sameUser)", async ({ failure, sameUser }) => {
  const f = await fixture();
  try {
    const token = sameUser ? await f.login() : (await otherUserSession(f)).bearer;
    const response = await f.app.request(oaPath(f, failure === "signature" ? { token: "invalid" } : { ts: "1699999700000" }), {
      headers: { Cookie: `global_session=${token}` },
    });
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    const after = await resolve(f, token);
    expect(after.status).toBe("resolved");
    expect(await f.scope.countRecords()).toBe(1);
  }
  finally {
    await f.scope.close();
  }
});

test("OA switches a different user after authentication and gives cookie precedence over the header", async () => {
  const f = await fixture();
  try {
    const old = await otherUserSession(f);
    const header = await f.login();
    const response = await f.app.request(oaPath(f), {
      headers: { Cookie: `global_session=${old.bearer}`, Authorization: header },
    });
    expect(response.status).toBe(302);
    const token = f.cookie(response)!;
    expect(token).not.toBe(old.bearer);
    expect(token).not.toBe(header);
    const previous = await resolve(f, old.bearer);
    expect(previous.status).toBe("terminated");
    const untouched = await resolve(f, header);
    expect(untouched.status).toBe("resolved");
    const current = await resolve(f, token);
    expect(current.status).toBe("resolved");
    if (current.status === "resolved") {
      expect(current.value.userSession.subjectIdentifier).toBe(f.subjectIdentifier);
      expect(current.value.userSession.amr).toEqual(["oa"]);
    }
    expect(f.audits.filter(audit => audit.action === "auth.login.oa")).toHaveLength(1);
  }
  finally {
    await f.scope.close();
  }
});

test.each(["missing", "terminated", "stale-generation"])("OA authenticates normally when the current session is %s", async (failure) => {
  const f = await fixture();
  try {
    const token = await f.login();
    if (failure === "terminated") {
      await f.app.request("/sso/logout?redirectUrl=https://iam.example", { headers: { Cookie: `global_session=${token}` } });
    }
    else if (failure === "stale-generation") {
      f.state.generation = randomUUID();
    }
    const response = await f.app.request(oaPath(f), {
      headers: { Cookie: `global_session=${failure === "missing" ? "missing-session" : token}` },
    });
    expect(response.status).toBe(302);
    const fresh = f.cookie(response)!;
    expect(fresh).not.toBe(token);
    const current = await resolve(f, fresh);
    expect(current.status).toBe("resolved");
    expect(f.audits.filter(audit => audit.action === "auth.login.oa")).toHaveLength(1);
  }
  finally {
    await f.scope.close();
  }
});

test.each(["storage", "barrier", "corrupt"])("OA preserves the cookie and refuses login when session state is uncertain: %s", async (failure) => {
  const f = await fixture();
  try {
    const token = await f.login();
    if (failure === "storage") {
      f.scope.failNext("resolveUser");
    }
    else if (failure === "barrier") {
      f.state.permission = "unknown";
    }
    else {
      await f.operations.run(async (operation) => {
        const session = await f.kernel.forOperation(operation).resolveUserSession(token);
        if (session.status !== "resolved")
          throw new Error("Missing fixture root");
        const user = session.value.userSession;
        await f.scope.corruptRecord({ kind: "userSession", id: user.userSessionId, instance: user.instance, userSessionId: user.userSessionId, subjectIdentifier: user.subjectIdentifier });
      });
    }
    const response = await f.app.request(oaPath(f), { headers: { Cookie: `global_session=${token}` } });
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await f.scope.countRecords()).toBe(1);
    expect(f.audits.filter(audit => audit.action === "auth.login.oa")).toEqual([]);
  }
  finally {
    await f.scope.close();
  }
});

test.each([false, true])("OA stops switching when logout fails (response lost: %s)", async (after) => {
  const f = await fixture();
  try {
    const old = await otherUserSession(f);
    f.scope.failNext("revoke", after);
    const response = await f.app.request(oaPath(f), { headers: { Cookie: `global_session=${old.bearer}` } });
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await f.scope.countRecords()).toBe(1);
    const previous = await resolve(f, old.bearer);
    expect(previous.status).toBe(after ? "terminated" : "resolved");
    expect(f.audits.filter(audit => audit.action === "auth.login.oa")).toEqual([]);
  }
  finally {
    await f.scope.close();
  }
});

test("OA does not restore the old session when new session creation fails after logout", async () => {
  const f = await fixture();
  try {
    const old = await otherUserSession(f);
    f.scope.failNext("create");
    const response = await f.app.request(oaPath(f), { headers: { Cookie: `global_session=${old.bearer}` } });
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    const previous = await resolve(f, old.bearer);
    expect(previous.status).toBe("terminated");
    expect(await f.scope.countRecords()).toBe(1);
    expect(f.audits.filter(audit => audit.action === "auth.login.oa")).toEqual([]);
  }
  finally {
    await f.scope.close();
  }
});
