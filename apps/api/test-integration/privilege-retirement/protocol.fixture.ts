import { createHash } from "node:crypto";
import { check, requiredText, same } from "./check.fixture";
import { clients, redirectUri, secret } from "./source.fixture";

const verifier = "cutover-pkce-verifier-abcdefghijklmnopqrstuvwxyz";
const challenge = createHash("sha256").update(verifier).digest("base64url");

function location(response: Response, base?: string) {
  return new URL(requiredText(response.headers.get("location"), "Protocol response location missing"), base);
}

function codeIn(url: URL) {
  return requiredText(url.searchParams.get("code"), "Protocol response Code missing");
}

export function protocol(origin: string, signal: AbortSignal) {
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${origin}${path}`, {
      ...init,
      headers: { "X-IAM-Entry-Network": "external", ...init.headers },
      redirect: "manual",
      signal,
    });
  const headers = (bearer: string) => ({ Cookie: `global_session=${bearer}` });
  const basic = (client: string) => `Basic ${Buffer.from(`${client}:${secret}`).toString("base64")}`;
  async function authorizeCustom(bearer: string, client: string = clients.custom) {
    const response = await request(
      `/sso/authorize?${new URLSearchParams({ client, redirectUrl: redirectUri, state: "cutover-original" })}`,
      { headers: headers(bearer) },
    );
    check(response.status === 302, "Custom authorization failed");
    return location(response);
  }
  async function exchangeCustom(code: string, client: string = clients.custom) {
    const response = await request("/sso/token", {
      method: "POST",
      headers: { Authorization: basic(client), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, redirect_uri: redirectUri }),
    });
    check(response.status === 200, "Custom Code exchange failed");
    const result = await response.json();
    check(typeof result.data.sid === "string", "Custom exchange did not deliver a Token");
    return result.data;
  }
  const customInfo = (token: string, client: string = clients.custom) =>
    request("/public/user-info", { headers: { Authorization: token, Client: client } });
  async function authorizeOidc(bearer?: string) {
    return await request(
      `/oidc/auth?${new URLSearchParams({ client_id: clients.oidc, redirect_uri: redirectUri, response_type: "code", scope: "openid profile iam:employments iam:authorization", code_challenge: challenge, code_challenge_method: "S256", state: "old-oidc-state", nonce: "old-oidc-nonce" })}`,
      bearer ? { headers: headers(bearer) } : {},
    );
  }
  async function exchangeOidc(code: string) {
    const response = await request("/oidc/token", {
      method: "POST",
      headers: { Authorization: basic(clients.oidc), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
    check(response.status === 200, "OIDC Code exchange failed");
    const result = await response.json();
    check(typeof result.access_token === "string", "OIDC exchange did not deliver a Token");
    return requiredText(result.access_token, "OIDC exchange did not deliver a Token");
  }
  const oidcInfo = (token: string) => request("/oidc/me", { headers: { Authorization: `Bearer ${token}` } });

  return { request, headers, authorizeCustom, exchangeCustom, customInfo, authorizeOidc, exchangeOidc, oidcInfo };
}

export type Protocol = ReturnType<typeof protocol>;
export interface OldProtocolState {
  customToken: string;
  customCode: string;
  oidcToken: string;
  oidcCode: string;
  customContinuationQuery: string;
  customContinuationBinding: string;
  oidcContinuationHandle: string;
  oidcContinuationCookie: string;
  managedToken: string;
  emptyToken: string;
  expiredToken: string;
  revokedToken: string;
}

function codeFrom(response: Response) {
  check(response.status === 303, "OIDC authorization did not return a Code");
  return codeIn(location(response));
}

export async function createOldProtocolState(
  api: Protocol,
  root: string,
  expiringRoot: string,
  revokedRoot: string,
): Promise<OldProtocolState> {
  // This result is produced by the pinned old executable, not by a new serializer.
  const first = await api.exchangeCustom(codeIn(await api.authorizeCustom(root)));
  check(first.subject.version === 2, "Pinned old API must deliver wire v2");
  same(first.subject.authorization.privileges, ["old-read"], "Old baseline must actually contain permission facts");
  const customCode = codeIn(await api.authorizeCustom(root));
  const oidcToken = await api.exchangeOidc(codeFrom(await api.authorizeOidc(root)));
  const oidcCode = codeFrom(await api.authorizeOidc(root));

  const customStart = await api.request(
    `/sso/authorize?${new URLSearchParams({ client: clients.custom, redirectUrl: redirectUri, state: "continued-old-state" })}`,
  );
  check(customStart.status === 302, "Old Custom continuation was not created");
  const login = location(customStart, "http://localhost");
  const customBinding = /custom_sso_continuation=([^;]+)/u.exec(customStart.headers.get("set-cookie") ?? "")?.[1];
  check(customBinding && login.searchParams.has("ssoReturn"), "Old Custom continuation binding missing");
  const oidcStart = await api.authorizeOidc();
  check(oidcStart.status === 302, "Old OIDC continuation was not created");
  const handle = location(oidcStart, "http://localhost").searchParams.get("oidcReturn");
  const oidcCookie = oidcStart.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  check(handle && oidcCookie, "Old OIDC continuation binding missing");
  const managedLocation = await api.authorizeCustom(root, clients.managed);
  const callback = await api.request(managedLocation.pathname + managedLocation.search);
  check(callback.status === 302, "Old managed callback failed");
  const managedToken = location(callback).searchParams.get("token");
  check(managedToken, "Old managed callback Token missing");
  const empty = await api.exchangeCustom(codeIn(await api.authorizeCustom(root, clients.empty)), clients.empty);
  const expired = await api.exchangeCustom(codeIn(await api.authorizeCustom(expiringRoot)));
  const revoked = await api.exchangeCustom(codeIn(await api.authorizeCustom(revokedRoot)));
  return {
    customToken: first.sid,
    customCode,
    oidcToken,
    oidcCode,
    customContinuationQuery: login.searchParams.toString(),
    customContinuationBinding: customBinding,
    oidcContinuationHandle: handle,
    oidcContinuationCookie: oidcCookie,
    managedToken,
    emptyToken: empty.sid,
    expiredToken: expired.sid,
    revokedToken: revoked.sid,
  };
}

const employment = {
  isPrimary: true,
  organization: { code: "ROOT", name: "Root", type: "分公司", path: [{ code: "ROOT", name: "Root", type: "分公司" }] },
  position: { code: "MANAGER", name: "Manager" },
};

export function expectedCustom(subject: string, client: string) {
  const roles = client === clients.empty ? [] : [`${client}-reader`];
  return {
    version: 3,
    subjectIdentifier: subject,
    profile: { username: "alice", name: "Alice", employments: [{ ...employment, responsibilities: [] }] },
    authorization: { employments: [{ ...employment, roles }], roles },
  };
}

export async function verifyNewProtocolState(api: Protocol, state: OldProtocolState, subject: string, root: string) {
  async function custom(token: string, client: string = clients.custom) {
    const response = await api.customInfo(token, client);
    check(response.status === 200, "Old Custom Token was not accepted after cutover");
    same(
      (await response.json()).data,
      expectedCustom(subject, client),
      "Custom UserInfo must deliver complete role-only v3 shape",
    );
  }
  await custom(state.customToken);
  await custom(state.emptyToken, clients.empty);
  await custom(state.managedToken, clients.managed);
  const info = await api.oidcInfo(state.oidcToken);
  check(info.status === 200, "Old OIDC Token was not accepted after cutover");
  const oidcEmployment = {
    isPrimary: true,
    organization: {
      orgCode: "ROOT",
      orgName: "Root",
      orgType: "分公司",
      fullOrgPath: [{ orgCode: "ROOT", orgName: "Root", orgType: "分公司" }],
    },
    position: { posCode: "MANAGER", posName: "Manager" },
  };
  same(
    await info.json(),
    {
      sub: subject,
      preferred_username: "alice",
      name: "Alice",
      "iam:employments": [{ ...oidcEmployment, responsibilities: [] }],
      "iam:authorization": {
        employments: [{ ...oidcEmployment, roles: [`${clients.oidc}-reader`] }],
        roles: [`${clients.oidc}-reader`],
      },
    },
    "OIDC UserInfo must deliver complete role-only claims for its Client",
  );
  const customExchanged = await api.exchangeCustom(state.customCode);
  same(customExchanged.subject, expectedCustom(subject, clients.custom), "Old Custom Code must deliver new shape");
  const oidcExchanged = await api.exchangeOidc(state.oidcCode);
  check((await api.oidcInfo(oidcExchanged)).status === 200, "Old OIDC Code must deliver usable new Token");
  const resumedCustom = await api.request(`/sso/authorize?${state.customContinuationQuery}`, {
    headers: { Cookie: `global_session=${root}; custom_sso_continuation=${state.customContinuationBinding}` },
  });
  check(resumedCustom.status === 302, "Old Custom continuation must remain usable");
  const customLocation = location(resumedCustom);
  check(
    customLocation.searchParams.get("state") === "continued-old-state",
    "Custom continuation lost original authorization state",
  );
  same(
    (await api.exchangeCustom(codeIn(customLocation))).subject,
    expectedCustom(subject, clients.custom),
    "Continued Custom Code must deliver new shape",
  );
  const resumedOidc = await api.request(`/oidc/resume?oidcReturn=${state.oidcContinuationHandle}`, {
    headers: { Cookie: `global_session=${root}; ${state.oidcContinuationCookie}` },
  });
  const continuedOidcToken = await api.exchangeOidc(codeFrom(resumedOidc));
  check(
    (await api.oidcInfo(continuedOidcToken)).status === 200,
    "Old OIDC continuation must complete in new candidate",
  );
  const managed = await api.request("/auth/authz", {
    headers: { Authorization: state.managedToken, Client: clients.managed, "X-Forwarded-Uri": "/home" },
  });
  check(managed.status === 200 && managed.headers.has("X-User-Info"), "Old managed Token must continue Gateway authz");
  check(
    (await api.customInfo(state.expiredToken)).status === 401,
    "Naturally expired old session must remain rejected",
  );
  check((await api.customInfo(state.revokedToken)).status === 401, "Revoked old session must remain rejected");
}
