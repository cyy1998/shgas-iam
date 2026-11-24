import { afterEach, expect, test } from "bun:test";
import {
  ApiErrorCode,
  ClientSsoCallbackType,
  ClientSsoConfigSchema,
  ClientSsoProtocol,
  SubjectClaim,
  UserType,
} from "@iam/contracts";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { clients, userDocuments, users } from "@iam/db/schema";
import { createApplicationAdmissionEvaluator } from "@iam/documents/user/admission";
import { eq } from "drizzle-orm";
import { cleanupAfterFixtureFailure, closeFixtureResources } from "../oidc/oidc.fixture";
import { ownApiTestExecutor, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { useApiPostgresTestHarness } from "../support/postgres-test-file.fixture";
import { publishUserDocument } from "../support/user-document.fixture";
import { fixture } from "./root-authentication.fixture";

const getDatabase = useApiPostgresTestHarness();
afterEach(resetApiRedisTestDatabase);

const client = "expense";
const redirectUrl = "https://app.example/callback";
const authorization = `/sso/authorize?${new URLSearchParams({ client, redirectUrl, state: "opaque" })}`;
const policy = {
  admissionEnabled: true,
  admissionFilter: { field: "userType", op: "eq", value: UserType.Formal },
};

async function admissionFixture(callbackType = ClientSsoCallbackType.Business, admissionEnabled = true) {
  const resources: Array<() => Promise<void>> = [];
  const close = ownApiTestExecutor(() => closeFixtureResources(resources));
  try {
    const { db } = getDatabase();
    const f = await fixture(30, undefined, 45, 60, undefined, {
      evaluator: createApplicationAdmissionEvaluator(db),
      source: createClientSnapshotRepository(db),
    });
    resources.push(f.close);
    await db.insert(clients).values({
      clientCode: client,
      clientName: "费用报销",
      clientSecret: "internal-client-secret",
      extAttributes: {},
      ...policy,
      admissionEnabled,
      ssoEnabled: true,
      ssoConfig: ClientSsoConfigSchema.parse({
        protocol: ClientSsoProtocol.CustomSso,
        callbackType,
        validRedirectUrls: [redirectUrl],
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        ...(callbackType === ClientSsoCallbackType.Business ? { callbackEndpoint: redirectUrl } : {}),
      }),
    });
    await db.insert(users).values({
      id: 1,
      subjectIdentifier: f.subjectIdentifier,
      username: "admission-test",
      name: "测试用户",
      userType: UserType.External,
    });
    async function authorize(root?: string) {
      return await f.app.request(`https://internal.example${authorization}`, {
        headers: {
          ...(root ? { Cookie: `global_session=${root}` } : {}),
          "X-Request-Id": "req-custom-admission",
          "X-Trace-Id": "trace-custom-admission",
        },
      });
    }
    async function enablePolicy() {
      await db.update(clients).set({ admissionEnabled: true }).where(eq(clients.clientCode, client));
      if (!f.invalidateClient) throw new Error("Missing admission snapshot invalidation fixture");
      await f.invalidateClient(client);
    }
    return { ...f, db, close, authorize, enablePolicy };
  } catch (error) {
    return await cleanupAfterFixtureFailure(error, close);
  }
}

test.each([ClientSsoCallbackType.Business, ClientSsoCallbackType.Managed])(
  "%s authorization sends a nonmatching user to the same IAM entry without an application session or Code",
  async (callbackType) => {
    const f = await admissionFixture(callbackType);
    try {
      await publishUserDocument(f.db, 1);
      const root = await f.login();
      const response = await f.authorize(root);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/portal/application-access-denied?client=expense");
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await f.scope.countRecords()).toBe(1);
      const inventory = await f.codes.independentInventory();
      expect(inventory.matching).toBe(0);
      expect(f.warnings).toContainEqual({
        event: "application.admission.denied",
        outcome: "no-match",
        protocol: "custom_sso",
        clientCode: client,
        requestId: "req-custom-admission",
        traceId: "trace-custom-admission",
      });
      await f.db.update(users).set({ userType: UserType.Formal }).where(eq(users.id, 1));
      const unpublished = await f.authorize(root);
      expect(unpublished.headers.get("location")).toBe("/portal/application-access-denied?client=expense");
      await publishUserDocument(f.db, 1, "2");
      const granted = await f.authorize(root);
      expect(granted.status).toBe(302);
      const callback = new URL(granted.headers.get("location")!);
      expect(callback.pathname).toBe(callbackType === ClientSsoCallbackType.Business ? "/callback" : "/sso/callback");
      expect(callback.searchParams.get("code")).toBeTruthy();
      expect(await f.scope.countRecords()).toBe(2);
    } finally {
      await f.close();
    }
  },
);

test("closed admission skips document lookup; missing and corrupt documents return a retryable result", async () => {
  const f = await admissionFixture(ClientSsoCallbackType.Business, false);
  try {
    const root = await f.login();
    const granted = await f.authorize(root);
    const code = new URL(granted.headers.get("location")!).searchParams.get("code")!;
    const priorGrant = await f.codes.inspectCode(client, code);
    expect(priorGrant).not.toBeNull();
    const beforeSessions = await f.operations.run((operation) =>
      f.kernel.forOperation(operation).captureSessions({ scope: { clientId: client } }),
    );
    const beforeCodeKeys = await f.codes.independentInventory();
    await f.enablePolicy();

    const missing = await f.authorize(root);
    await publishUserDocument(f.db, 1);
    await f.db
      .update(userDocuments)
      .set({ document: { userType: UserType.External } })
      .where(eq(userDocuments.userId, 1));
    const corrupt = await f.authorize(root);
    for (const response of [missing, corrupt]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("3");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      const body = await response.json();
      expect(body).toMatchObject({ code: ApiErrorCode.InternalError, message: "服务暂时不可用" });
    }
    await publishUserDocument(f.db, 1, "2");
    const denied = await f.authorize(root);
    expect(denied.headers.get("location")).toBe("/portal/application-access-denied?client=expense");
    const afterSessions = await f.operations.run((operation) =>
      f.kernel.forOperation(operation).captureSessions({ scope: { clientId: client } }),
    );
    expect(afterSessions).toEqual(beforeSessions);
    expect(await f.codes.independentInventory()).toEqual(beforeCodeKeys);
    expect(await f.codes.inspectCode(client, code)).toEqual(priorGrant);

    const exchanged = await f.app.request("/sso/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${client}:business-secret`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ code, redirect_uri: redirectUrl }),
    });
    expect(exchanged.status).toBe(200);
    const { data } = await exchanged.json();
    const online = await f.app.request("/public/user-info", {
      headers: { Authorization: data.sid, Client: client },
    });
    expect(online.status).toBe(200);
  } finally {
    await f.close();
  }
});

test.each(["password", "sms", "oa", "wechat"] as const)(
  "%s authentication continues to admission for the target application",
  async (method) => {
    const f = await admissionFixture();
    try {
      await publishUserDocument(f.db, 1);
      const start = await f.authorize();
      expect(start.status).toBe(302);
      const login = new URL(start.headers.get("location")!, "https://internal.example");
      expect(login.pathname).toBe("/portal/login");
      const binding = /custom_sso_continuation=([^;]+)/u.exec(start.headers.get("set-cookie") ?? "")?.[1];
      if (!binding) throw new Error("Missing Custom SSO continuation binding");

      let signedIn: Response;
      let resume = `/sso/authorize${login.search}`;
      if (method === "password") {
        signedIn = await f.password();
      } else if (method === "sms") {
        signedIn = await f.app.request("/auth/login/mobile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: "17721462865", code: "sms-code" }),
        });
      } else {
        const query = new URLSearchParams(login.search);
        if (method === "oa") {
          query.set("loginid", "138550");
          query.set("ts", "1700000000000");
          query.set("token", f.oaToken);
          signedIn = await f.app.request(`/sso/thirdparty/oa?${query}`);
        } else {
          query.set("code", "wx-code");
          signedIn = await f.app.request(`/sso/third-party/wx?${query}`);
        }
        expect(signedIn.status).toBe(302);
        resume = signedIn.headers.get("location")!;
      }
      const root = f.cookie(signedIn);
      if (!root) throw new Error("Missing UserSession cookie");
      const response = await f.app.request(resume, {
        headers: { Cookie: `global_session=${root}; custom_sso_continuation=${binding}` },
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/portal/application-access-denied?client=expense");
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await f.scope.countRecords()).toBe(1);
    } finally {
      await f.close();
    }
  },
);

test("matching admission never substitutes for Subject Access", async () => {
  const f = await admissionFixture();
  try {
    await f.db.update(users).set({ userType: UserType.Formal }).where(eq(users.id, 1));
    await publishUserDocument(f.db, 1);
    const root = await f.login();
    f.state.permission = "disabled";
    const blocked = await f.authorize(root);
    expect(blocked.headers.get("location")).toStartWith("/portal/login?");
    expect(await f.scope.countRecords()).toBe(1);
    expect(f.warnings).not.toContainEqual(expect.objectContaining({ event: "application.admission.denied" }));
  } finally {
    await f.close();
  }
});
