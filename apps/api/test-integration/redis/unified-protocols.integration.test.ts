import type { ClientSsoConfig } from "@iam/contracts";
import { Buffer } from "node:buffer";
import { ApiErrorCode, ClientSsoCallbackType, ClientSsoProtocol, OidcClientType, OidcScope, SubjectClaim } from "@iam/contracts";
import { expect, test } from "bun:test";
import { fixture } from "./oidc.fixture";

test("joint HTTP original relationship rejects both protocols after a late Token race and missing-index root termination", async () => {
  const f = await fixture(
    { code: 30, continuation: 60 },
    true,
    undefined,
    45,
    undefined,
    true,
    undefined,
    true,
    true,
  );
  let release: (() => void) | undefined;
  let winner: Promise<Response> | undefined;
  try {
    const root = await f.login();
    const oidcConfig: ClientSsoConfig = {
      protocol: ClientSsoProtocol.Oidc,
      clientType: OidcClientType.Public,
      redirectUris: ["https://rp.example/callback"],
      postLogoutRedirectUris: [],
      allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
    };
    const customConfig: ClientSsoConfig = {
      protocol: ClientSsoProtocol.CustomSso,
      callbackType: ClientSsoCallbackType.Business,
      callbackEndpoint: "https://rp.example/callback",
      validRedirectUrls: ["https://rp.example/callback"],
      subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
    };
    const select = (custom: boolean) =>
      f.setClient(value => ({ ...value, ssoConfig: custom ? customConfig : oidcConfig }));
    async function oidcCode(clientId = f.clientId) {
      const response = await f.authorize({ client_id: clientId });
      expect(response.status).toBe(303);
      const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
      const record = await f.oidcState.readCode(clientId, code);
      if (!record)
        throw new Error("Expected owner-persisted OIDC Code");
      return { code, record };
    }
    const exchangeOidc = (code: string, clientId = f.clientId) =>
      f.request("/oidc/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          grant_type: "authorization_code",
          redirect_uri: "https://rp.example/callback",
          code_verifier: "v".repeat(43),
        }),
      });
    const useOidc = (token: string) =>
      f.request("/oidc/me", { headers: { Authorization: `Bearer ${token}`, Cookie: "" } });
    async function mintOidc(clientId = f.clientId) {
      const issued = await oidcCode(clientId);
      const response = await exchangeOidc(issued.code, clientId);
      expect(response.status).toBe(200);
      return { ...issued, token: String((await response.json()).access_token) };
    }
    async function mintCustom() {
      const response = await f.request(
        `/sso/authorize?${new URLSearchParams({ client: f.clientId, redirectUrl: "https://rp.example/callback" })}`,
      );
      expect(response.status).toBe(302);
      const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
      const tokenResponse = await f.request("/sso/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${f.clientId}:current secret:+`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ code, redirect_uri: "https://rp.example/callback" }),
      });
      expect(tokenResponse.status).toBe(200);
      return { code, token: String((await tokenResponse.json()).data.sid) };
    }
    const useCustom = (token: string) =>
      f.request("/public/user-info", { headers: { Authorization: token, Client: f.clientId, Cookie: "" } });
    f.addClient("joint-peer");
    const peer = await mintOidc("joint-peer");
    await select(true);
    const custom = await mintCustom();
    await select(false);
    const initial = await mintOidc();
    const wrongProtocol = await useCustom(custom.token);
    expect(wrongProtocol.status).toBe(400);
    expect(await wrongProtocol.json()).toMatchObject({ code: ApiErrorCode.InvalidSsoClient, data: null });
    expect(custom.code.split(".").slice(1)).toEqual(initial.code.split(".").slice(1));
    expect(peer.record.userSessionId).toBe(initial.record.userSessionId);
    const raced = await oidcCode();
    let reached!: () => void;
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.oidcState.beforeNext("saveToken", async () => {
      reached();
      await gate;
    });
    winner = exchangeOidc(raced.code);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ready,
        winner.then(() => {
          throw new Error("OIDC winner completed before the persistence latch");
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("OIDC winner did not reach Token persistence")), 4000);
        }),
      ]);
    }
    finally {
      clearTimeout(timer);
    }
    expect((await exchangeOidc(raced.code)).status).toBe(400);
    const replacement = await oidcCode();
    expect(replacement.record.clientSessionId).not.toBe(raced.record.clientSessionId);
    release?.();
    const lateResponse = await winner;
    expect(lateResponse.status).toBe(200);
    const lateToken = String((await lateResponse.json()).access_token);
    expect(await f.oidcState.readToken(lateToken)).not.toBeNull();
    expect((await useOidc(lateToken)).status).toBe(401);
    expect((await useOidc(initial.token)).status).toBe(401);
    expect((await useOidc(peer.token)).status).toBe(200);
    await select(true);
    expect((await useCustom(custom.token)).status).toBe(401);
    const newCustom = await mintCustom();
    expect(newCustom.code.split(".")[2]).toBe(replacement.record.clientSessionId);
    await select(false);
    expect((await exchangeOidc(raced.code)).status).toBe(400);
    const lateCustom = await f.request("/sso/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${f.clientId}:current secret:+`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ code: custom.code, redirect_uri: "https://rp.example/callback" }),
    });
    expect(lateCustom.status).toBe(400);
    expect(await lateCustom.json()).toMatchObject({ code: ApiErrorCode.InvalidSsoClient, data: null });
    expect(lateCustom.headers.get("X-IAM-Client-Session-Revocation")).toBe("already_terminated");
    const newOidc = await mintOidc();
    expect(newOidc.record.clientSessionId).toBe(replacement.record.clientSessionId);
    expect((await useOidc(newOidc.token)).status).toBe(200);
    await f.login();
    const otherRoot = await mintOidc("joint-peer");
    expect(otherRoot.record.userSessionId).not.toBe(initial.record.userSessionId);
    f.cookies.set("global_session", root);
    await f.scope.forgetChildIndex(initial.record.userSessionId);
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const observed = await sessions.resolveUserSession(root);
      if (observed.status !== "resolved")
        throw new Error("Expected original root");
      const result = await sessions.revokeObservedUserSession(observed.value);
      expect(result.status).toBe("terminated");
    });
    expect((await useOidc(newOidc.token)).status).toBe(401);
    expect((await useOidc(otherRoot.token)).status).toBe(200);
    await select(true);
    expect((await useCustom(newCustom.token)).status).toBe(401);
  }
  finally {
    release?.();
    if (winner)
      await winner.catch(() => {});
    await f.close();
  }
}, 15000);
