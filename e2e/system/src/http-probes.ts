export async function probeGateway(origin: string, signal?: AbortSignal) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (signal?.aborted)
      throw signal.reason ?? new Error("Gateway probe aborted");
    try {
      await requestGateway(new URL("/", origin), {
        redirect: "manual",
        signal: probeSignal(signal),
      });
      return;
    }
    catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Gateway did not accept HTTP requests at ${origin}`, {
    cause: lastError,
  });
}

export async function probeHttpRoute(
  origin: string,
  path: string,
  expectedStatuses: number[],
  signal?: AbortSignal,
) {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (signal?.aborted)
      throw signal.reason ?? new Error("Gateway route probe aborted");
    try {
      const response = await requestGateway(new URL(path, origin), {
        redirect: "manual",
        signal: probeSignal(signal),
      });
      if (expectedStatuses.includes(response.status))
        return;
      lastError = new Error(`received HTTP ${response.status}`);
    }
    catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Gateway route ${path} was not ready at ${origin}`, {
    cause: lastError,
  });
}

export interface OidcDiscoveryProbeOptions {
  maxAttempts?: number;
  request?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  retryDelayMs?: number;
}

export type SsoConfigurationProbeOptions = OidcDiscoveryProbeOptions;

export async function probeSsoConfiguration(
  origin: string,
  signal?: AbortSignal,
  options: SsoConfigurationProbeOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? Number.POSITIVE_INFINITY;
  const request = options.request ?? requestGateway;
  const retryDelayMs = options.retryDelayMs ?? 250;
  const expectedData = {
    authorizationEndpoint: new URL("/sso/authorize", origin).href,
    logoutEndpoint: new URL("/sso/logout", origin).href,
    thirdPartyOAEndpoint: new URL("/sso/thirdparty/oa", origin).href,
  };
  await runRetryingProtocolProbe({
    abortMessage: "Custom SSO configuration probe aborted",
    failureMessage: `Custom SSO configuration was not ready at ${origin}`,
    maxAttempts,
    retryDelayMs,
    signal,
    attempt: async () => {
      for (const entryNetwork of ["internal", "external"] as const) {
        const response = await request(
          new URL("/sso/.well-known/authentication-configuration", origin),
          {
            headers: { "X-IAM-Entry-Network": entryNetwork },
            redirect: "manual",
            signal: probeSignal(signal),
          },
        );
        if (!response.ok)
          throw new Error(`received HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (!isExpectedSsoConfiguration(body, expectedData))
          throw new Error(`received unexpected ${entryNetwork} configuration`);
      }
    },
  });
}

export async function probeOidcDiscovery(
  origin: string,
  signal?: AbortSignal,
  options: OidcDiscoveryProbeOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? Number.POSITIVE_INFINITY;
  const request = options.request ?? requestGateway;
  const retryDelayMs = options.retryDelayMs ?? 250;
  if (maxAttempts !== Number.POSITIVE_INFINITY
    && (!Number.isInteger(maxAttempts) || maxAttempts <= 0)) {
    throw new Error("OIDC discovery probe attempts must be a positive integer");
  }
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0)
    throw new Error("OIDC discovery retry delay must be a non-negative integer");

  const discoveryUrl = new URL(
    "/oidc/.well-known/openid-configuration",
    origin,
  );
  const expectedMetadata = {
    authorization_endpoint: new URL("/oidc/auth", origin).href,
    end_session_endpoint: new URL("/oidc/session/end", origin).href,
    issuer: new URL("/oidc", origin).href,
    jwks_uri: new URL("/oidc/jwks", origin).href,
    token_endpoint: new URL("/oidc/token", origin).href,
    userinfo_endpoint: new URL("/oidc/me", origin).href,
  };
  await runRetryingProtocolProbe({
    abortMessage: "OIDC discovery probe aborted",
    failureMessage: `OIDC discovery metadata was not ready at ${origin}`,
    maxAttempts,
    retryDelayMs,
    signal,
    attempt: async () => {
      const response = await request(discoveryUrl, {
        redirect: "manual",
        signal: probeSignal(signal),
      });
      if (!response.ok)
        throw new Error(`received HTTP ${response.status}`);
      const metadata: unknown = await response.json();
      if (!isExpectedOidcDiscoveryMetadata(metadata, expectedMetadata))
        throw new Error("received unexpected OIDC discovery metadata");
    },
  });
}

interface RetryingProtocolProbeOptions {
  abortMessage: string;
  attempt: () => Promise<void>;
  failureMessage: string;
  maxAttempts: number;
  retryDelayMs: number;
  signal?: AbortSignal;
}

async function runRetryingProtocolProbe(
  options: RetryingProtocolProbeOptions,
) {
  const deadline = Date.now() + 60_000;
  let attempt = 0;
  let lastError: unknown;
  while (attempt < options.maxAttempts && Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error(options.abortMessage);
    }
    attempt += 1;
    try {
      await options.attempt();
      return;
    }
    catch (error) {
      lastError = error;
    }
    if (attempt < options.maxAttempts && Date.now() < deadline) {
      await waitForProbeRetry(
        options.retryDelayMs,
        options.signal,
        options.abortMessage,
      );
    }
  }
  throw new Error(options.failureMessage, { cause: lastError });
}

function isExpectedOidcDiscoveryMetadata(
  metadata: unknown,
  expected: Record<string, string>,
) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
    return false;
  const record = metadata as Record<string, unknown>;
  return Object.entries(expected).every(
    ([field, value]) => record[field] === value,
  );
}

function isExpectedSsoConfiguration(
  body: unknown,
  expected: Record<string, string>,
) {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return false;
  const envelope = body as Record<string, unknown>;
  if (envelope.code !== 200 || envelope.message !== "success")
    return false;
  if (typeof envelope.data !== "object" || envelope.data === null || Array.isArray(envelope.data))
    return false;
  const data = envelope.data as Record<string, unknown>;
  return Object.entries(expected).every(([field, value]) => data[field] === value);
}

function waitForProbeRetry(
  delayMs: number,
  signal: AbortSignal | undefined,
  abortMessage: string,
) {
  if (signal === undefined)
    return new Promise<void>(resolve => setTimeout(resolve, delayMs));
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error(abortMessage));
    };
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted)
      onAbort();
  });
}

function probeSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(2_000);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

// Only the two synthetic E2E authorities are resolved locally. The Host still
// reaches the real APISIX routes and determines their configured entry.
async function requestGateway(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (!["internal.iam.localhost", "external.iam.localhost"].includes(url.hostname))
    return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("Host", url.host);
  url.hostname = "127.0.0.1";
  return fetch(url, { ...init, headers });
}
