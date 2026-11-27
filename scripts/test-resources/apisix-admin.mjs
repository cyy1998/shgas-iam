import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

export const testApisixAdminUrlEnv = "IAM_TEST_APISIX_ADMIN_URL";
export const testApisixAdminKeyEnv = "IAM_TEST_APISIX_ADMIN_KEY";
export const apisixResourceEndpoints = [
  "upstreams",
  "plugin_metadata",
  "plugin_configs",
  "services",
  "consumers",
  "ssls",
  "routes",
];

const isEmptyList = (list) =>
  Array.isArray(list) ? !list.length : Boolean(list) && typeof list === "object" && !Object.keys(list).length;
const reqSignal = (signal, ms) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

export function parseApisixAdminConfig(environment = process.env) {
  const [rawUrl, adminKey] = [environment[testApisixAdminUrlEnv]?.trim(), environment[testApisixAdminKeyEnv]?.trim()];
  if (!rawUrl || !adminKey) {
    throw new Error(
      `Gateway APISIX integration tests require ${testApisixAdminUrlEnv} and ${testApisixAdminKeyEnv} from the root Integration runner`,
    );
  }
  const parsed = URL.parse(rawUrl);
  if (
    !parsed ||
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Invalid ${testApisixAdminUrlEnv}: ${rawUrl}`);
  }
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (!path.endsWith("/apisix/admin"))
    throw new Error(`${testApisixAdminUrlEnv} must end with /apisix/admin: ${rawUrl}`);
  return { adminUrl: `${parsed.origin}${path}`, adminKey };
}

class ApisixAdminAuthError extends Error {}

export async function waitForApisixAdmin(adminUrl, adminKey, options = {}) {
  const {
    signal,
    timeoutMs = 15_000,
    requestTimeoutMs = 2000,
    pollIntervalMs = 100,
    fetch: fetchImpl = globalThis.fetch,
  } = options;
  const baseUrl = adminUrl.replace(/\/+$/u, "");
  const deadline = performance.now() + timeoutMs;
  let failure;
  while (performance.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const res = await fetchImpl(`${baseUrl}/routes`, {
        headers: { "X-API-KEY": adminKey },
        signal: reqSignal(signal, requestTimeoutMs),
      });
      await res.arrayBuffer();
      if (res.ok) return;
      if (res.status === 401 || res.status === 403)
        throw new ApisixAdminAuthError(`APISIX Admin rejected credentials with HTTP ${res.status}`);
      failure = new Error(`APISIX Admin readiness returned HTTP ${res.status}`);
    } catch (error) {
      if (error instanceof ApisixAdminAuthError) throw error;
      if (signal?.aborted) throw signal.reason;
      failure = error;
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await delay(Math.min(pollIntervalMs, remaining), undefined, { signal });
  }
  throw new Error("APISIX Admin did not become ready", { cause: failure });
}

export async function assertApisixAdminEmpty(adminUrl, adminKey, options = {}) {
  const { signal, requestTimeoutMs = 5000, fetch: fetchImpl = globalThis.fetch } = options;
  const baseUrl = adminUrl.replace(/\/+$/u, "");
  for (const endpoint of apisixResourceEndpoints) {
    signal?.throwIfAborted();
    const res = await fetchImpl(`${baseUrl}/${endpoint}?page=1&page_size=10`, {
      headers: { Accept: "application/json", "X-API-KEY": adminKey },
      signal: reqSignal(signal, requestTimeoutMs),
    });
    if (!res.ok)
      throw new Error(`APISIX Admin baseline check failed for ${endpoint}: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (!body || typeof body !== "object" || body.total !== 0 || !isEmptyList(body.list)) {
      const count = typeof body?.total === "number" ? ` (total=${body.total})` : "";
      throw new Error(
        `APISIX Admin baseline is not empty for ${endpoint}${count}; refusing to use a non-empty or unknown-ownership APISIX endpoint`,
      );
    }
  }
}

export async function verifyApisixAdminBaseline(endpoint, options = {}) {
  await waitForApisixAdmin(endpoint.adminUrl, endpoint.adminKey, options);
  await assertApisixAdminEmpty(endpoint.adminUrl, endpoint.adminKey, options);
}
