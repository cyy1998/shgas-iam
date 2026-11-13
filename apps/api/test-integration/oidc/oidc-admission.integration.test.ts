import { afterEach, expect, test } from "bun:test";
import { ClientSsoProtocol, OidcScope, UserType } from "@iam/contracts";
import { userDocuments, users } from "@iam/db/schema";
import { createApplicationAdmissionEvaluator } from "@iam/documents/user/admission";
import type { OidcAuthorizationOptions } from "@iam/oidc";
import type { OidcTokenResponse } from "@iam/oidc/wire";
import { eq } from "drizzle-orm";
import { ownApiTestExecutor, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";
import { publishUserDocument } from "../support/user-document.fixture";
import { cleanupAfterFixtureFailure, closeFixtureResources, fixture } from "./oidc.fixture";

afterEach(resetApiRedisTestDatabase);

const policy = {
  admissionEnabled: true,
  admissionFilter: { field: "userType", op: "eq", value: UserType.Formal },
};

function redirect(response: Response, base?: string) {
  const location = response.headers.get("location");
  if (!location) throw new Error(`Missing redirect on OIDC response ${response.status}`);
  return new URL(location, base);
}

async function admissionFixture(admissionEnabled = true, beforeEvaluation?: () => Promise<void>) {
  const resources: Array<() => Promise<void>> = [];
  const close = ownApiTestExecutor(() => closeFixtureResources(resources));
  try {
    const { db } = await createApiPostgresTestHarness((stop) => resources.push(stop));
    const evaluator = createApplicationAdmissionEvaluator(db);
    const admission: OidcAuthorizationOptions["admission"] = {
      async evaluate(input) {
        await beforeEvaluation?.();
        return evaluator.evaluate(input);
      },
    };
    const f = await fixture(undefined, true, undefined, 45, undefined, true, undefined, true, false, { admission });
    resources.push(f.close);
    await db.insert(users).values({
      id: 1,
      subjectIdentifier: f.subjectIdentifier,
      username: "admission-test",
      name: "测试用户",
      userType: UserType.External,
    });
    await f.setClient((value) => ({ ...value, ...policy, admissionEnabled }));
    return { ...f, db, close };
  } catch (error) {
    return await cleanupAfterFixtureFailure(error, close);
  }
}

test.each([
  ["query", "external"],
  ["fragment", "internal"],
  ["form_post", "external"],
] as const)("OIDC %s denial returns the registered callback and the trusted %s IAM page", async (mode, entry) => {
  const f = await admissionFixture();
  try {
    await publishUserDocument(f.db, 1);
    f.setEntry(entry);
    const root = await f.login();
    const before = f.state.acquisitions;
    const traceId = "1234567890abcdef1234567890abcdef";
    const response = await f.request(`/oidc/auth?${f.parameters({ response_mode: mode, state: 'rp-state<&"' })}`, {
      headers: {
        Host: "untrusted.example",
        "X-Request-Id": "req-oidc-admission",
        traceparent: `00-${traceId}-1234567890abcdef-01`,
      },
    });
    const issuer = f.issuers[entry];
    const page = `${new URL(issuer).origin}/portal/application-access-denied?client=${f.clientId}`;
    expect(f.state.acquisitions - before).toBe(1);
    if (mode === "form_post") {
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      const body = await response.text();
      expect(body).toContain('method="post" action="https://rp.example/callback"');
      expect(body).toContain(`name="iss" value="${issuer}"`);
      expect(body).toContain('name="state" value="rp-state&lt;&amp;&quot;"');
      expect(body).toContain('name="error" value="access_denied"');
      expect(body).toContain(`name="error_uri" value="${page}"`);
      expect(body).not.toContain('name="code"');
    } else {
      expect(response.status).toBe(303);
      const callback = redirect(response);
      expect(`${callback.origin}${callback.pathname}`).toBe("https://rp.example/callback");
      const parameters = mode === "query" ? callback.searchParams : new URLSearchParams(callback.hash.slice(1));
      expect(Object.fromEntries(parameters)).toEqual({
        iss: issuer,
        state: 'rp-state<&"',
        error: "access_denied",
        error_description: "Application access denied",
        error_uri: page,
      });
    }
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(f.cookies.get("global_session")).toBe(root);
    const records = await f.scope.countRecords();
    expect(records).toBe(1);
    const grants = await f.oidcState.snapshot();
    expect(grants).toEqual([]);
    expect(f.reports).toEqual([
      {
        event: "application.admission.denied",
        outcome: "no-match",
        protocol: "oidc",
        clientCode: f.clientId,
        requestId: "req-oidc-admission",
        traceId,
      },
    ]);
  } finally {
    await f.close();
  }
});

test("OIDC prompt=none delivers denial to the RP without a page and keeps Subject Access independent", async () => {
  const f = await admissionFixture();
  try {
    const redirectUri = "https://rp.example/callback?view=account%20details&view=compact&error_uri=rp%2fhelp";
    await f.setClient((value) => ({
      ...value,
      ssoConfig:
        value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
          ? { ...value.ssoConfig, redirectUris: [...value.ssoConfig.redirectUris, redirectUri] }
          : null,
    }));
    const silent = { prompt: "none", redirect_uri: redirectUri };
    await publishUserDocument(f.db, 1);
    const noSession = await f.authorize(silent);
    expect(redirect(noSession).searchParams.get("error")).toBe("login_required");
    expect(redirect(noSession).searchParams.get("error_uri")).toBe("rp/help");
    await f.login();
    const denied = await f.authorize({ prompt: "none" });
    expect(Object.fromEntries(redirect(denied).searchParams)).toEqual({
      iss: f.issuers.external,
      state: "rp-state",
      error: "access_denied",
      error_description: "Application access denied",
    });
    const query = redirect(await f.authorize(silent));
    expect(query.href.startsWith(`${redirectUri}&`)).toBe(true);
    expect(query.searchParams.getAll("view")).toEqual(["account details", "compact"]);
    expect(query.searchParams.getAll("error_uri")).toEqual(["rp/help"]);
    expect(query.searchParams.get("error")).toBe("access_denied");
    expect(query.searchParams.has("code")).toBe(false);
    const fragment = redirect(await f.authorize({ ...silent, response_mode: "fragment" }));
    expect(fragment.href.split("#")[0]).toBe(redirectUri);
    const fragmentFields = new URLSearchParams(fragment.hash.slice(1));
    expect(fragmentFields.get("error")).toBe("access_denied");
    expect(fragmentFields.has("error_uri")).toBe(false);
    expect(fragmentFields.has("code")).toBe(false);
    const form = await f.authorize({ ...silent, response_mode: "form_post" });
    const formBody = await form.text();
    expect(form.status).toBe(200);
    expect(formBody).toContain(
      'action="https://rp.example/callback?view=account%20details&amp;view=compact&amp;error_uri=rp%2fhelp"',
    );
    expect(formBody).toContain('name="error" value="access_denied"');
    expect(formBody).not.toContain('name="error_uri"');
    expect(formBody).not.toContain('name="code"');
    const untrustedCallback = await f.authorize({ redirect_uri: "https://unregistered.example/callback" });
    expect(untrustedCallback.status).toBe(400);
    expect(untrustedCallback.headers.get("location")).toBeNull();
    await f.db.update(users).set({ userType: UserType.Formal }).where(eq(users.id, 1));
    await publishUserDocument(f.db, 1, "2");
    f.state.permission = "disabled";
    const disabled = await f.authorize(silent);
    expect(redirect(disabled).searchParams.get("error")).toBe("login_required");
    const grants = await f.oidcState.snapshot();
    expect(grants).toEqual([]);
    expect(f.reports).toHaveLength(4);
  } finally {
    await f.close();
  }
});

test("OIDC preserves a continuation on transient failure and observes new admission on resume", async () => {
  const bothEvaluating = Promise.withResolvers<void>();
  const resumeEvaluation = Promise.withResolvers<void>();
  let competing = false;
  let evaluations = 0;
  const f = await admissionFixture(false, async () => {
    if (!competing) return;
    if (++evaluations === 2) bothEvaluating.resolve();
    await resumeEvaluation.promise;
  });
  try {
    const initial = await f.authorize({ nonce: "original", response_mode: "fragment" });
    expect(initial.status).toBe(302);
    const login = redirect(initial, "https://iam.example");
    const handle = login.searchParams.get("oidcReturn");
    if (!handle) throw new Error("Expected OIDC continuation");
    const original = await f.oidcState.snapshot();
    expect(original).toHaveLength(1);
    expect(original[0]?.value).not.toContain("admission");
    await f.request(`/oidc/login-guard?oidcReturn=${handle}`);
    const root = await f.login();
    const resume = `/oidc/resume?oidcReturn=${handle}`;
    await f.setClient((value) => ({
      ...value,
      ...policy,
      ssoConfig:
        value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
          ? { ...value.ssoConfig, allowedScopes: [OidcScope.OpenId], redirectUris: ["https://rp.example/new"] }
          : null,
    }));
    const before = await f.oidcState.snapshot();
    const observations = f.state.acquisitions;
    const transient = await f.request(resume);
    expect(f.state.acquisitions - observations).toBe(1);
    expect(transient.status).toBe(303);
    const transientCallback = redirect(transient);
    expect(`${transientCallback.origin}${transientCallback.pathname}`).toBe("https://rp.example/callback");
    expect(Object.fromEntries(new URLSearchParams(transientCallback.hash.slice(1)))).toEqual({
      iss: f.issuers.external,
      state: "rp-state",
      error: "temporarily_unavailable",
      error_description: "Application admission unavailable",
    });
    expect(transient.headers.getSetCookie()).toEqual([]);
    expect(f.protocolReports).toContainEqual(
      expect.objectContaining({ errorCode: "temporarily_unavailable", outcome: "unavailable", statusCode: 503 }),
    );
    const afterTransient = await f.oidcState.snapshot();
    expect(afterTransient).toEqual(before);
    const afterTransientSessions = await f.scope.countRecords();
    expect(afterTransientSessions).toBe(1);

    await publishUserDocument(f.db, 1);
    competing = true;
    const requests = [f.request(resume), f.request(resume)];
    // Both requests must get past continuation lookup before either can consume it.
    try {
      await Promise.race([
        bothEvaluating.promise,
        Promise.race(requests).then(() => {
          throw new Error("Both resumes did not reach admission");
        }),
      ]);
    } finally {
      resumeEvaluation.resolve();
    }
    const final = await Promise.all(requests);
    expect(final.map((response) => response.status).sort()).toEqual([303, 400]);
    const denied = final.find((response) => response.status === 303);
    if (!denied) throw new Error("Expected one authorization denial");
    const deniedCallback = redirect(denied);
    expect(deniedCallback.pathname).toBe("/callback");
    expect(Object.fromEntries(new URLSearchParams(deniedCallback.hash.slice(1)))).toEqual({
      iss: f.issuers.external,
      state: "rp-state",
      error: "access_denied",
      error_description: "Application access denied",
      error_uri: `https://iam.example/portal/application-access-denied?client=${f.clientId}`,
    });
    expect(f.cookies.get("global_session")).toBe(root);
    const replay = await f.request(resume);
    expect(replay.status).toBe(400);
    const grants = await f.oidcState.snapshot();
    expect(grants).toEqual([]);
    expect(f.reports).toHaveLength(1);
    const records = await f.scope.countRecords();
    expect(records).toBe(1);
  } finally {
    await f.close();
  }
});

test("OIDC new authorization uses the last valid publication and preserves earlier Code and ClientSession", async () => {
  const f = await admissionFixture(false);
  try {
    const root = await f.login();
    const first = await f.authorize();
    const code = redirect(first).searchParams.get("code");
    if (!code) throw new Error("Expected Code with disabled admission and no published document");
    const original = await f.oidcState.readCode(f.clientId, code);
    if (!original) throw new Error("Missing original Code");
    const target = {
      kind: "clientSession" as const,
      id: original.clientSessionId,
      instance: original.clientSessionInstance,
      userSessionId: original.userSessionId,
      subjectIdentifier: f.subjectIdentifier,
      clientId: f.clientId,
    };
    const session = await f.scope.inspect(target);
    const grants = await f.oidcState.snapshot();
    await f.setClient((value) => ({ ...value, ...policy }));

    const missing = await f.authorize();
    await publishUserDocument(f.db, 1);
    await f.db
      .update(userDocuments)
      .set({ document: { userType: UserType.External } })
      .where(eq(userDocuments.userId, 1));
    const corrupt = await f.authorize();
    for (const response of [missing, corrupt]) {
      expect(response.status).toBe(303);
      const parameters = redirect(response).searchParams;
      expect(parameters.get("error")).toBe("temporarily_unavailable");
      expect(parameters.has("error_uri")).toBe(false);
      expect(parameters.has("code")).toBe(false);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    await publishUserDocument(f.db, 1, "2");
    await f.db.update(users).set({ userType: UserType.Formal }).where(eq(users.id, 1));
    const oldPublication = await f.authorize();
    expect(redirect(oldPublication).searchParams.get("error")).toBe("access_denied");
    expect(f.cookies.get("global_session")).toBe(root);
    const sessionAfter = await f.scope.inspect(target);
    expect(sessionAfter).toEqual(session);
    const grantsAfter = await f.oidcState.snapshot();
    expect(grantsAfter).toEqual(grants);

    const exchanged = await f.request("/oidc/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: f.clientId,
        redirect_uri: "https://rp.example/callback",
        code_verifier: "v".repeat(43),
        code,
      }),
    });
    expect(exchanged.status).toBe(200);
    const tokens: OidcTokenResponse = await exchanged.json();
    const userInfo = await f.request("/oidc/me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    expect(userInfo.status).toBe(200);

    await publishUserDocument(f.db, 1, "3");
    const granted = await f.authorize();
    const newCode = redirect(granted).searchParams.get("code");
    if (!newCode) throw new Error("Expected Code for matching publication");
    const record = await f.oidcState.readCode(f.clientId, newCode);
    expect(record).toMatchObject({
      clientSessionId: original.clientSessionId,
      clientSessionInstance: original.clientSessionInstance,
    });
    expect(record).not.toHaveProperty("admissionFilter");
    expect(record).not.toHaveProperty("admissionEnabled");
  } finally {
    await f.close();
  }
});

test("OIDC resumes matching admission with the accepted PKCE and scope", async () => {
  const f = await admissionFixture();
  try {
    await f.db.update(users).set({ userType: UserType.Formal }).where(eq(users.id, 1));
    await publishUserDocument(f.db, 1);
    const initial = await f.authorize({ nonce: "accepted-nonce" });
    const login = redirect(initial, "https://iam.example");
    const handle = login.searchParams.get("oidcReturn");
    if (!handle) throw new Error("Expected OIDC continuation");
    await f.login();
    const before = f.state.acquisitions;
    const response = await f.request(`/oidc/resume?oidcReturn=${handle}`);
    expect(response.status).toBe(303);
    expect(f.state.acquisitions - before).toBe(1);
    const code = redirect(response).searchParams.get("code");
    if (!code) throw new Error("Expected Code after matching admission on resume");
    const record = await f.oidcState.readCode(f.clientId, code);
    expect(record).toMatchObject({
      redirectUri: "https://rp.example/callback",
      nonce: "accepted-nonce",
      scope: "openid profile",
      state: "rp-state",
      codeChallenge: f.parameters().get("code_challenge"),
      codeChallengeMethod: "S256",
    });
    expect(record).not.toHaveProperty("admissionFilter");
    expect(record).not.toHaveProperty("admissionEnabled");
  } finally {
    await f.close();
  }
});
