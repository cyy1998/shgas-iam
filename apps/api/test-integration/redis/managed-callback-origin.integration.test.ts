import { Buffer } from "node:buffer";
import { ClientSsoCallbackType, ClientSsoProtocol, SubjectClaim } from "@iam/contracts";
import { expect, test } from "bun:test";
import { fixture } from "./root-authentication.fixture";

function configure(f: Awaited<ReturnType<typeof fixture>>, patterns: string[], type = ClientSsoCallbackType.Managed) {
  f.setClient({ ...f.getClient(), ssoConfig: {
    protocol: ClientSsoProtocol.CustomSso,
    ...(type === ClientSsoCallbackType.Business
      ? { callbackType: type, callbackEndpoint: "https://fixed.example/sso/callback?tenant=old" }
      : { callbackType: type }),
    validRedirectUrls: patterns,
    subjectClaims: [SubjectClaim.SubjectIdentifier],
  } });
}

test.each([
  ["https://app.example/work", "https://app.example/work", "https://app.example"],
  ["https://app.example/work/*", "https://app.example/work/orders?order=123", "https://app.example"],
  ["https://*.example.com/work/*", "https://internal.example.com/work/orders", "https://internal.example.com"],
  ["https://*.example.com/work/*", "https://external.example.com/work/orders", "https://external.example.com"],
  ["http://localhost:8181/work/*", "http://localhost:8181/work/orders?order=123", "http://localhost:8181"],
  ["https://app.example:8443/work/*", "https://APP.example:8443/work/orders", "https://app.example:8443"],
])("managed accepts %s and fixes callback and full landing facts", async (pattern, redirectUrl, origin) => {
  const f = await fixture();
  try {
    configure(f, [pattern!]);
    const root = await f.login();
    const response = await f.app.request(`/sso/authorize?${new URLSearchParams({ client: "iam", redirectUrl: redirectUrl!, state: "original" })}`, {
      headers: { Cookie: `global_session=${root}` },
    });
    expect(response.status).toBe(302);
    const callback = new URL(response.headers.get("location")!);
    expect(callback.origin + callback.pathname).toBe(`${origin}/sso/callback`);
    expect(callback.searchParams.has("tenant")).toBe(false);
    const code = await f.codes.inspectCode("iam", callback.searchParams.get("code")!);
    expect(code).toMatchObject({ redeemer: "managed", callbackEndpoint: `${origin}/sso/callback`, redirectUrl: new URL(redirectUrl!).href, state: "original" });
    configure(f, ["https://other.example/only"]);
    callback.searchParams.set("state", "untrusted-query");
    const delivered = await f.app.request(`/sso/callback${callback.search}`);
    expect(delivered.status).toBe(302);
    const landing = new URL(delivered.headers.get("location")!);
    expect(landing.origin + landing.pathname).toBe(new URL(redirectUrl!).origin + new URL(redirectUrl!).pathname);
    expect(landing.searchParams.get("order")).toBe(new URL(redirectUrl!).searchParams.get("order"));
    expect(landing.searchParams.get("state")).toBe("original");
    expect(landing.searchParams.get("token")).toBeTruthy();
    const replay = await f.app.request(`/sso/callback${callback.search}`);
    expect(replay.status).not.toBe(302);
  }
  finally { await f.scope.close(); }
});

test.each([
  "ftp://app.example/work/order",
  "https://user:pass@app.example/work/order",
  "https://app.example/work/order#fragment",
  "https://app.example:8443/work/order",
  "https://app.example/other",
  "https://deep.app.example/work/order",
])("managed rejects disallowed complete landing %s before issuing Code", async (redirectUrl) => {
  const f = await fixture();
  try {
    configure(f, ["https://*.example/work/*"]);
    const root = await f.login();
    const response = await f.app.request(`/sso/authorize?${new URLSearchParams({ client: "iam", redirectUrl })}`, {
      headers: { Cookie: `global_session=${root}` },
    });
    expect(response.status).not.toBe(302);
    expect(response.headers.get("location")).toBeNull();
  }
  finally { await f.scope.close(); }
});

test.each([ClientSsoCallbackType.Managed, ClientSsoCallbackType.Business])("%s continuation and Code reject a later callback type change", async (type) => {
  const f = await fixture();
  try {
    const redirectUrl = "https://app.example/work";
    configure(f, [redirectUrl], type);
    const start = await f.app.request(`/sso/authorize?${new URLSearchParams({ client: "iam", redirectUrl })}`);
    const continuation = new URL(start.headers.get("location")!, "https://iam.example");
    const binding = /custom_sso_continuation=([^;]+)/u.exec(start.headers.get("set-cookie")!)![1];
    const root = await f.login();
    const headers = { Cookie: `global_session=${root}; custom_sso_continuation=${binding}` };
    const accepted = await f.app.request(`/sso/authorize?${continuation.searchParams}`, { headers });
    const callback = new URL(accepted.headers.get("location")!);
    configure(f, [redirectUrl], type === ClientSsoCallbackType.Managed ? ClientSsoCallbackType.Business : ClientSsoCallbackType.Managed);
    const resumed = await f.app.request(`/sso/authorize?${continuation.searchParams}`, { headers });
    expect(resumed.status).toBe(400);
    const guard = await f.app.request(`/sso/login-guard?${continuation.searchParams}`, { headers });
    expect(guard.status).toBe(400);
    const delivered = await f.app.request(`/sso/callback?${new URLSearchParams({
      client: "iam",
      code: callback.searchParams.get("code")!,
      redirectUrl,
    })}`);
    expect(delivered.status).not.toBe(302);
    const exchanged = await f.app.request("/sso/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from("iam:business-secret").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ code: callback.searchParams.get("code")!, redirect_uri: redirectUrl }),
    });
    expect(exchanged.status).not.toBe(200);
  }
  finally { await f.scope.close(); }
});

test("managed continuation keeps its original callback after allowlist edits and expires without renewal", async () => {
  const f = await fixture(30, undefined, 45, 1);
  try {
    const redirectUrl = "https://app.example/work/order?order=1";
    configure(f, ["https://app.example/work/*"]);
    const start = await f.app.request(`/sso/authorize?${new URLSearchParams({ client: "iam", redirectUrl, state: "bound" })}`);
    const continuation = new URL(start.headers.get("location")!, "https://iam.example");
    const binding = /custom_sso_continuation=([^;]+)/u.exec(start.headers.get("set-cookie")!)![1];
    const headers = { Cookie: `custom_sso_continuation=${binding}` };
    configure(f, ["https://other.example/only"]);
    const pending = await f.app.request(`/sso/authorize?${continuation.searchParams}`, { headers });
    expect(new URL(pending.headers.get("location")!, "https://iam.example").searchParams.get("ssoReturn")).toBe(continuation.searchParams.get("ssoReturn"));
    const root = await f.login();
    const resumed = await f.app.request(`/sso/authorize?${continuation.searchParams}`, { headers: { Cookie: `${headers.Cookie}; global_session=${root}` } });
    const callback = new URL(resumed.headers.get("location")!);
    expect(callback.origin + callback.pathname).toBe("https://app.example/sso/callback");
    const delivered = await f.app.request(`/sso/callback${callback.search}`);
    expect(delivered.status).toBe(302);
    await Bun.sleep(1100);
    const expired = await f.app.request(`/sso/authorize?${continuation.searchParams}`, { headers });
    expect(expired.status).toBe(400);
  }
  finally { await f.scope.close(); }
});

test("expired managed Code cannot deliver a Cookie or Token", async () => {
  const f = await fixture(1);
  try {
    const redirectUrl = "https://app.example/work";
    configure(f, [redirectUrl]);
    const root = await f.login();
    const issued = await f.app.request(`/sso/authorize?${new URLSearchParams({ client: "iam", redirectUrl })}`, {
      headers: { Cookie: `global_session=${root}` },
    });
    const callback = new URL(issued.headers.get("location")!);
    await Bun.sleep(1100);
    const expired = await f.app.request(`/sso/callback${callback.search}`);
    expect(expired.status).not.toBe(302);
    expect(expired.headers.get("location")).toBeNull();
    expect(expired.headers.get("set-cookie")).toBeNull();
    const inventory = await f.codes.tokenInventory();
    expect(inventory).toEqual([]);
  }
  finally { await f.scope.close(); }
});
