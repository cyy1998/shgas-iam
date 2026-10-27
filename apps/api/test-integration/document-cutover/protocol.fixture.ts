import { createHash, randomUUID } from "node:crypto";
import { createLoginCredential, UserDocumentSchema } from "@iam/contracts";
import { OrganizationDocumentSchema } from "@iam/organization-document";
import { check, requiredText, same } from "./check.fixture";
import { clients, loginKeys, password, redirectUri, secret } from "./source.fixture";

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
  async function login() {
    const response = await request("/auth/login/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential: createLoginCredential({
          username: "alice",
          password,
          kid: "entry-smoke",
          publicKey: loginKeys.publicKey,
          now: Date.now(),
          nonce: randomUUID(),
        }),
      }),
    });
    check(response.status === 200, "Pinned old API password login failed");
    return requiredText(
      /global_session=([^;]+)/u.exec(response.headers.get("set-cookie") ?? "")?.[1],
      "Old API did not create a UserSession Cookie",
    );
  }
  async function authorizeCustom(bearer: string, client: string = clients.custom) {
    const response = await request(
      `/sso/authorize?${new URLSearchParams({ client, redirectUrl: redirectUri, state: "cutover-original" })}`,
      { headers: headers(bearer) },
    );
    check(response.status === 302, "Custom authorization failed");
    return location(response);
  }
  const customExchangeResponse = (code: string, client: string = clients.custom) =>
    request("/sso/token", {
      method: "POST",
      headers: { Authorization: basic(client), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, redirect_uri: redirectUri }),
    });
  async function exchangeCustom(code: string, client: string = clients.custom) {
    const response = await customExchangeResponse(code, client);
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
  const oidcExchangeResponse = (code: string, client: string = clients.oidc) =>
    request("/oidc/token", {
      method: "POST",
      headers: { Authorization: basic(client), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
  async function exchangeOidcTokens(code: string) {
    const response = await oidcExchangeResponse(code);
    check(response.status === 200, "OIDC Code exchange failed");
    const result = await response.json();
    check(typeof result.access_token === "string", "OIDC exchange did not deliver a Token");
    return result;
  }
  async function exchangeOidc(code: string) {
    return requiredText((await exchangeOidcTokens(code)).access_token, "OIDC Token missing");
  }
  const oidcInfo = (token: string) => request("/oidc/me", { headers: { Authorization: `Bearer ${token}` } });

  return {
    request,
    headers,
    login,
    authorizeCustom,
    exchangeCustom,
    customExchangeResponse,
    customInfo,
    authorizeOidc,
    exchangeOidc,
    exchangeOidcTokens,
    oidcExchangeResponse,
    oidcInfo,
  };
}

export type Protocol = ReturnType<typeof protocol>;
export interface OldProtocolState {
  customToken: string;
  customCode: string;
  oidcToken: string;
  oidcIdToken: string;
  oidcCode: string;
  customContinuationQuery: string;
  customContinuationBinding: string;
  oidcContinuationHandle: string;
  oidcContinuationCookie: string;
  managedToken: string;
  emptyToken: string;
  revokedToken: string;
}

function codeFrom(response: Response) {
  check(response.status === 303, "OIDC authorization did not return a Code");
  return codeIn(location(response));
}

export async function createOldProtocolState(
  api: Protocol,
  root: string,
  revokedRoot: string,
  codeRoot: string,
): Promise<OldProtocolState> {
  // This result is produced by the pinned old executable, not by a new serializer.
  const first = await api.exchangeCustom(codeIn(await api.authorizeCustom(root)));
  check(first.subject.version === 3, "Pinned 95dc API must deliver wire v3");
  const customCode = codeIn(await api.authorizeCustom(codeRoot));
  const oidcTokens = await api.exchangeOidcTokens(codeFrom(await api.authorizeOidc(root)));
  const oidcToken = requiredText(oidcTokens.access_token, "Old OIDC Access Token missing");
  const oidcIdToken = requiredText(oidcTokens.id_token, "Old OIDC ID Token missing");
  const oidcCode = codeFrom(await api.authorizeOidc(codeRoot));

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
  const revoked = await api.exchangeCustom(codeIn(await api.authorizeCustom(revokedRoot)));
  return {
    customToken: first.sid,
    customCode,
    oidcToken,
    oidcIdToken,
    oidcCode,
    customContinuationQuery: login.searchParams.toString(),
    customContinuationBinding: customBinding,
    oidcContinuationHandle: handle,
    oidcContinuationCookie: oidcCookie,
    managedToken,
    emptyToken: empty.sid,
    revokedToken: revoked.sid,
  };
}

const employment = {
  isPrimary: true,
  organization: {
    code: "ROOT",
    name: "Current Root",
    type: "分公司",
    path: [{ code: "ROOT", name: "Current Root", type: "分公司", level: 1, distanceToTarget: 0 }],
  },
  position: { code: "MANAGER", name: "Manager" },
};

export function expectedCustom(subject: string, client: string) {
  const roles = client === clients.empty ? [] : [`${client}-reader`];
  return {
    version: 4,
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
      "Custom UserInfo must deliver complete wire4 shape",
    );
  }
  await custom(state.customToken);
  await custom(state.emptyToken, clients.empty);
  await custom(state.managedToken, clients.managed);
  const info = await api.oidcInfo(state.oidcToken);
  check(info.status === 200, "Old OIDC Token was not accepted after cutover");
  const oidcEmployment = employment;
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
  check(
    (await api.customExchangeResponse(state.customCode, clients.other)).status !== 200,
    "Wrong Client accepted preserved Custom Code",
  );
  check(
    (await api.oidcExchangeResponse(state.oidcCode, clients.oidcOther)).status !== 200,
    "Wrong Client accepted preserved OIDC Code",
  );
  const customExchanged = await api.exchangeCustom(state.customCode);
  same(customExchanged.subject, expectedCustom(subject, clients.custom), "Old Custom Code must deliver new shape");
  const oidcExchanged = await api.exchangeOidc(state.oidcCode);
  check((await api.oidcInfo(oidcExchanged)).status === 200, "Old OIDC Code must deliver usable new Token");
  check((await api.customExchangeResponse(state.customCode)).status !== 200, "Custom Code was consumed twice");
  check((await api.oidcExchangeResponse(state.oidcCode)).status !== 200, "OIDC Code was consumed twice");
  check(
    (await api.customInfo(customExchanged.sid)).status === 401,
    "Custom Code replay did not terminate its precise ClientSession",
  );
  check(
    (await api.oidcInfo(oidcExchanged)).status === 401,
    "OIDC Code replay did not terminate its precise ClientSession",
  );
  await custom(state.customToken);
  await custom(state.emptyToken, clients.empty);
  check((await api.oidcInfo(state.oidcToken)).status === 200, "Code replay damaged an unrelated root's valid Token");
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
  check((await api.customInfo(state.revokedToken)).status === 401, "Revoked old session must remain rejected");
  const logout = await api.request(
    `/oidc/session/end?${new URLSearchParams({ id_token_hint: state.oidcIdToken, client_id: clients.oidc })}`,
    { headers: api.headers(root) },
  );
  check(logout.status === 200, "Old signed ID Token hint was rejected by new artifact");
  const xsrf = requiredText(
    /name="xsrf" value="([^"]+)"/u.exec(await logout.text())?.[1],
    "Old ID Token did not produce logout confirmation",
  );
  const logoutCookies = logout.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const cancelled = await api.request("/oidc/session/end/confirm", {
    method: "POST",
    headers: {
      Cookie: `global_session=${root}; ${logoutCookies}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ xsrf }),
  });
  check(cancelled.status === 303, "Old ID Token logout cancellation failed");
  await custom(state.emptyToken, clients.empty);
  await verifyDirectory(api);
}

async function verifyDirectory(api: Protocol) {
  async function get(path: string, client: string = clients.custom) {
    const response = await api.request(path, { headers: { apikey: `internal-${client}` } });
    check(response.status === 200, "Published directory detail failed");
    return (await response.json()).data;
  }
  async function search(kind: "users" | "organizations", filter: object, client: string = clients.custom) {
    const response = await api.request(`/internal/${kind}/search-dsl`, {
      method: "POST",
      headers: { apikey: `internal-${client}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filter }),
    });
    check(response.status === 200, "Published directory search failed");
    return (await response.json()).data;
  }
  for (const username of ["alice", "bob", "paused", "disabled"]) {
    const detail = await get(`/internal/users/${username}`);
    same(detail, UserDocumentSchema.parse(detail), "Internal User document leaked storage fields");
    same(
      await search("users", { field: "user.username", op: "eq", value: username }),
      [detail],
      "User detail/search diverged",
    );
  }
  for (const code of ["ROOT", "PAUSED", "DISABLED"]) {
    const detail = await get(`/internal/organizations/${code}`);
    same(detail, OrganizationDocumentSchema.parse(detail), "Internal Organization document leaked storage fields");
    same(
      await search("organizations", { field: "organization.code", op: "eq", value: code }),
      [detail],
      "Organization detail/search diverged",
    );
  }
  check(
    (await api.request("/internal/users/deleted", { headers: { apikey: `internal-${clients.custom}` } })).status ===
      404,
    "Deleted user was readable",
  );
  check(
    (await api.request("/internal/organizations/DELETED", { headers: { apikey: `internal-${clients.custom}` } }))
      .status === 404,
    "Deleted organization was readable",
  );
  const ownRole = (client: string) => ({
    exists: { path: "employments", where: { field: "roles", op: "containsAny", value: [`${client}-reader`] } },
  });
  const alice = await get("/internal/users/alice");
  same(alice.employments[0].roles, [`${clients.custom}-reader`], "Internal response disclosed another Client role");
  same(await search("users", ownRole(clients.other)), [], "Internal filter observed another Client role");
  same(
    await search("users", {
      and: [{ field: "user.username", op: "eq", value: "alice" }, { not: ownRole(clients.other) }],
    }),
    [alice],
    "Negated role filter used global roles",
  );
  const internal = await get("/internal/users/alice", clients.internal);
  same(internal.employments[0].roles, [`${clients.internal}-reader`], "Non-SSO Internal Client lost its own roles");
  same(
    await search("users", ownRole(clients.internal), clients.internal),
    [internal],
    "Non-SSO role search diverged from response",
  );
  const empty = await get("/internal/users/alice", clients.empty);
  same(empty.employments[0].roles, [], "Employment without Client roles was dropped or gained foreign roles");
}
