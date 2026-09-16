import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createBoundedProcessLogCapture, spawnOwnedProcessTree, terminateProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { upgradeBrowser, upgradeRedirectUri } from "./dual-entry-upgrade-http.fixture";

type SourceOptions = {
  sourceDirectory: string;
  environment: NodeJS.ProcessEnv;
  origin: string;
  apiPort: number;
  providerPort: number;
  logDirectory: string;
};

/** Both writers resolve dependencies in the fixed source checkout, never in the candidate workspace. */
export async function startB648Source(options: SourceOptions) {
  const nodeExecutable = Bun.which("node");
  assert.ok(nodeExecutable, "Fixed source Provider requires Node 24 on the parent process PATH");
  await mkdir(options.logDirectory, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...options.environment,
    IAM_API_PORT: String(options.apiPort),
    IAM_API_LOGIN_ENDPOINT: `${options.origin}/login`,
    IAM_API_SESSION_DEFAULT_TTL_SECONDS: "3600",
    IAM_API_AUTH_CODE_TTL_SECONDS: "300",
    IAM_OIDC_PROVIDER_PORT: String(options.providerPort),
    IAM_OIDC_PROVIDER_ISSUER: `${options.origin}/oidc`,
    IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: options.origin,
    IAM_OIDC_PROVIDER_SSO_LOGIN_PATH: "/login",
    IAM_OIDC_PROVIDER_COOKIE_SECURE: "false",
    IAM_OIDC_PROVIDER_TRUST_PROXY: "true",
    IAM_OIDC_PROVIDER_GLOBAL_SESSION_COOKIE: "global_session",
    IAM_OIDC_PROVIDER_GLOBAL_SESSION_TTL_SECONDS: "3600",
    IAM_OIDC_PROVIDER_AUTHORIZATION_CODE_TTL_SECONDS: "300",
    IAM_OIDC_PROVIDER_INTERACTION_TTL_SECONDS: "600",
    IAM_OIDC_PROVIDER_ACCESS_TOKEN_TTL_SECONDS: "3600",
    IAM_OIDC_PROVIDER_ID_TOKEN_TTL_SECONDS: "3600",
    IAM_OIDC_PROVIDER_LOG_LEVEL: "warn",
    IAM_OIDC_PROVIDER_LOG_FORMAT: "json",
  };
  for (const suffix of [
    "DATABASE_URL",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
    "REDIS_DB",
    "SESSION_KERNEL_NAMESPACE",
    "SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS",
    "SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS",
    "SESSION_KERNEL_TOMBSTONE_TTL_SECONDS",
    "SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS",
  ]) {
    env[`IAM_OIDC_PROVIDER_${suffix}`] = env[`IAM_API_${suffix}`];
  }
  for (const suffix of ["CURRENT_JWK_JSON", "PREVIOUS_JWK_JSON"])
    env[`IAM_OIDC_PROVIDER_${suffix}`] = env[`IAM_API_OIDC_${suffix}`];
  env.IAM_OIDC_PROVIDER_COOKIE_KEYS = env.IAM_API_OIDC_COOKIE_KEYS
    ?? `${randomBytes(32).toString("hex")},${randomBytes(32).toString("hex")}`;

  const owned: {
    child: ReturnType<typeof spawnOwnedProcessTree>;
    logs: ReturnType<typeof createBoundedProcessLogCapture>;
    label: string;
    stopped: boolean;
  }[] = [];
  async function stop() {
    const results = await Promise.allSettled(owned.map(async (owner) => {
      if (owner.stopped)
        return;
      try {
        await terminateProcessTree(owner.child, { timeoutMs: 5000 });
        owner.stopped = true;
      }
      finally {
        await writeFile(join(options.logDirectory, `b648-${owner.label}.log`), owner.logs.snapshot(), "utf8");
        if (owner.stopped)
          owner.logs.dispose();
      }
    }));
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(failures.map(result => result.reason), "Fixed source process cleanup failed");
  }
  async function start(label: string, executable: string, args: string[], port: number, readyPath: string) {
    const child = spawnOwnedProcessTree({ executable, args, cwd: join(options.sourceDirectory, "apps", label), env });
    const logs = createBoundedProcessLogCapture(child, { maxBytes: 2 * 1024 * 1024 });
    owned.push({ child, logs, label, stopped: false });
    let spawnFailed = false;
    child.once("error", () => {
      spawnFailed = true;
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnFailed || child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Fixed source ${label} exited before readiness; see owned process log`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}${readyPath}`, { headers: { "X-IAM-Entry-Network": "external" }, signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.status === 200) {
          assert.ok(child.pid, "Fixed source writer must expose an owned PID");
          return child.pid;
        }
      }
      catch {
        // Only readiness probes retry; protocol traffic below is never retried.
      }
      await setTimeout(100);
    }
    throw new Error(`Fixed source ${label} readiness timed out; see owned process log`);
  }
  try {
    const apiProcessId = await start("api", process.execPath, ["--no-env-file", "run", "src/index.ts"], options.apiPort, "/sso/.well-known/authentication-configuration");
    const providerProcessId = await start("oidc-provider", nodeExecutable, ["--import", "tsx", "src/index.ts"], options.providerPort, "/oidc/health");
    return { apiProcessId, providerProcessId, stop };
  }
  catch (error) {
    try {
      await stop();
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Fixed source startup and cleanup failed");
    }
    throw error;
  }
}

/** Follow only IAM redirects. The external RP is an observed boundary, never an HTTP destination. */
async function followAuthorization(browser: ReturnType<typeof upgradeBrowser>, path: string, anonymous: boolean) {
  let next = new URL(path, browser.origin);
  let interactionPath: string | undefined;
  for (let hop = 0; hop < 12; hop++) {
    assert.equal(next.origin, browser.origin, "Source authorization must stay on its configured IAM origin");
    if (next.pathname.includes("/interaction/"))
      interactionPath = `${next.pathname}${next.search}`;
    const response = await browser.request(next.href);
    assert.ok([302, 303].includes(response.status), "Source authorization must produce a protocol redirect");
    const location = response.headers.get("location");
    assert.ok(location, "Source authorization redirect must have a Location");
    next = new URL(location, next);
    await response.body?.cancel();
    if (anonymous && next.origin === browser.origin && next.pathname === "/login")
      return { location: next, interactionPath };
    if (!anonymous && `${next.origin}${next.pathname}` === upgradeRedirectUri)
      return { location: next, interactionPath };
  }
  throw new Error("Source authorization exceeded its bounded redirect chain");
}

/** All sensitive artifacts remain in memory and originate from the real old HTTP writer. */
export async function writeB648OidcState(options: {
  origin: string;
  clientCode: string;
  secret?: string;
  rootCookies: Map<string, string>;
}) {
  const verifier = "v".repeat(43);
  const authorizePath = `/oidc/auth?${new URLSearchParams({
    client_id: options.clientCode,
    redirect_uri: upgradeRedirectUri,
    response_type: "code",
    scope: "openid profile",
    state: "b648-upgrade",
    nonce: "b648-upgrade",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  })}`;
  const browser = upgradeBrowser(options.origin, options.rootCookies);
  async function issueCode() {
    const { location } = await followAuthorization(browser, authorizePath, false);
    const code = location.searchParams.get("code");
    assert.ok(code, "Fixed source authorization must issue a Code");
    return code;
  }
  const redeemedCode = await issueCode();
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if (options.secret !== undefined)
    headers.set("Authorization", `Basic ${Buffer.from(`${options.clientCode}:${options.secret}`).toString("base64")}`);
  const exchange = await browser.request("/oidc/token", {
    method: "POST",
    headers,
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: redeemedCode,
      redirect_uri: upgradeRedirectUri,
      code_verifier: verifier,
      ...(options.secret === undefined ? { client_id: options.clientCode } : {}),
    }),
  });
  assert.equal(exchange.status, 200, "Fixed source Code must exchange successfully");
  const tokenBody = await exchange.json();
  assert.equal(typeof tokenBody.access_token, "string");
  assert.equal(typeof tokenBody.id_token, "string");
  const token = String(tokenBody.access_token);
  const idToken = String(tokenBody.id_token);
  const claims = JSON.parse(Buffer.from(idToken.split(".")[1]!, "base64url").toString("utf8"));
  assert.equal(claims.iss, `${options.origin}/oidc`);
  const me = await browser.request("/oidc/me", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200, "Fixed source Token must be usable before migration");
  await me.body?.cancel();
  const code = await issueCode();
  const anonymous = upgradeBrowser(options.origin);
  const { location, interactionPath } = await followAuthorization(anonymous, authorizePath, true);
  const handle = location.searchParams.get("oidcReturn");
  assert.ok(handle, "Fixed source must issue a real anonymous OIDC return handle");
  const query = new URLSearchParams({ oidcReturn: handle });
  const guardPath = `/oidc/login-guard?${query}`;
  const guard = await anonymous.request(guardPath);
  assert.equal(guard.status, 200, "Fixed source continuation must pass its login guard");
  await guard.body?.cancel();
  const keys = await browser.request("/oidc/jwks");
  assert.equal(keys.status, 200);
  const jwks = await keys.json();
  assert.ok(Array.isArray(jwks.keys) && jwks.keys.length >= 1, "Fixed source must publish its signing keys");
  return {
    token,
    idToken,
    code,
    cookies: new Map(browser.cookies),
    continuation: { cookies: new Map(anonymous.cookies), guardPath, resumePath: `/oidc/resume?${query}`, interactionPath },
    jwks,
    verifier,
  };
}
