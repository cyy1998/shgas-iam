import type { SubjectFactsSnapshot } from "@iam/client-subject-projection";
import type { OidcScope } from "@iam/contracts";
import type { OidcTokenResponse } from "@iam/oidc/wire";
import { ClientSsoProtocol } from "@iam/contracts";
import { expect } from "bun:test";
import { cleanupAfterFixtureFailure, fixture } from "./oidc.fixture";

export async function userInfoFixture(subjectFacts?: {
  read: (subject: string) => Promise<SubjectFactsSnapshot | null>;
}) {
  const f = await fixture(undefined, true, undefined, 45, subjectFacts);
  try {
    await f.login();
    async function issue(scope = "openid", client = f.clientId) {
      const response = await f.authorize({ scope, client_id: client });
      expect(response.status).toBe(303);
      const code = new URL(response.headers.get("Location")!).searchParams.get("code")!;
      const record = await f.oidcState.readCode(client, code);
      const exchanged = await f.request("/oidc/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: client,
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://rp.example/callback",
          code_verifier: "v".repeat(43),
        }),
      });
      expect(exchanged.status).toBe(200);
      const value: OidcTokenResponse = await exchanged.json();
      return {
        ...value,
        record: record!,
        target: {
          kind: "clientSession" as const,
          id: record!.clientSessionId,
          instance: record!.clientSessionInstance,
          userSessionId: record!.userSessionId,
          subjectIdentifier: f.subjectIdentifier,
          clientId: client,
        },
      };
    }
    async function scopes(values: OidcScope[]) {
      await f.setClient(value => ({
        ...value,
        ssoConfig:
          value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
            ? { ...value.ssoConfig, allowedScopes: values }
            : null,
      }));
    }
    async function me(bearer: string, method = "GET", headers: Record<string, string> = {}) {
      return await f.request("/oidc/me", {
        method,
        headers: { Authorization: `Bearer ${bearer}`, ...headers },
      });
    }
    return { ...f, issue, scopes, me };
  }
  catch (failure) {
    return await cleanupAfterFixtureFailure(failure, f.close);
  }
}
