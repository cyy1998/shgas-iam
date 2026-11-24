export async function publishGateway(
  input: {
    yaml: string;
    variables: Record<string, string>;
    clientSecret: string;
    gatewayOrigin: string;
    adminUrl: string;
    adminKey: string;
    signal?: AbortSignal;
    includeRpTerminals?: boolean;
    wecomMobile?: { authority: string; cert: string; privateKey: string };
  },
  request: (input: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  // Publish the test-owned topology through the authenticated Gateway API. The
  // API upstream Host differs from browser authorities to exercise trusted forwarding.
  const source = Bun.YAML.parse(input.yaml);
  if (typeof source !== "object" || source === null || !("upstreams" in source) || !Array.isArray(source.upstreams))
    throw new Error("E2E Gateway manifest has no upstreams");
  const api = source.upstreams.find(
    (upstream: unknown) =>
      typeof upstream === "object" && upstream !== null && "key" in upstream && upstream.key === "api",
  );
  if (!api) throw new Error("E2E Gateway manifest has no API upstream");
  api.pass_host = "rewrite";
  api.upstream_host = "api.e2e.internal";
  if (!("routes" in source) || !Array.isArray(source.routes)) throw new Error("E2E Gateway manifest has no routes");
  const frontend = source.routes.find(
    (route: unknown) => typeof route === "object" && route !== null && "key" in route && route.key === "sso-frontend",
  );
  if (!frontend || typeof frontend.plugins !== "object" || frontend.plugins === null)
    throw new Error("E2E Gateway manifest has no frontend logging policy");
  // These test-owned RP terminals only receive completed protocol navigation.
  // The static upstream has no IAM logic or browser script that can redirect.
  if (input.includeRpTerminals !== false) {
    for (const [entry, authority] of [
      ["internal", input.variables.IAM_SSO_INTERNAL_HOST],
      ["external", input.variables.IAM_SSO_EXTERNAL_HOST],
    ]) {
      if (!authority) throw new Error(`E2E Gateway ${entry} authority is missing`);
      source.routes.push({
        key: `e2e-rp-${entry}`,
        uris: ["/e2e/custom-sso/callback", "/e2e/business/callback", "/e2e/business/landing", "/e2e/oidc/callback"],
        vars: [["http_host", "==", authority]],
        plugins: {
          ...frontend.plugins,
          "proxy-rewrite": { uri: "/portal/e2e-rp.html" },
        },
        upstream: "sso-frontend",
      });
    }
  }
  let variables = input.variables;
  if (input.wecomMobile) {
    const { authority, cert, privateKey } = input.wecomMobile;
    // The normal telemetry policy records query strings. These routes carry OAuth state and continuations.
    const privatePlugins = {
      "request-id": frontend.plugins["request-id"],
      opentelemetry: { sampler: { name: "always_off" } },
    };
    source.routes.push({
      key: "wecom-mobile",
      uri: "/sso/wechat-qr/mobile/*",
      vars: [
        ["http_host", "==", authority],
        ["scheme", "==", "https"],
      ],
      upstream: "api",
      priority: 10,
      plugins: {
        ...privatePlugins,
        "proxy-rewrite": { headers: { set: { "X-IAM-Entry-Network": "external", "X-Forwarded-Proto": "$scheme" } } },
      },
    });
    for (const protocol of ["sso", "oidc"]) {
      const route = source.routes.find((route) => route.key === `${protocol}-internal`);
      if (!route) throw new Error(`E2E Gateway has no internal ${protocol} route`);
      source.routes.push({
        key: `wecom-desktop-${protocol}`,
        uris: [`/${protocol}/wechat-qr`, `/${protocol}/wechat-qr/*`],
        vars: route.vars,
        upstream: route.upstream,
        priority: 10,
        plugins: { ...privatePlugins, ...route.plugins },
      });
    }
    Object.assign(source, {
      ssls: [
        {
          key: "wecom-mobile",
          cert: `\${IAM_E2E_WECHAT_QR_TLS_CERT}`,
          private_key: `\${IAM_E2E_WECHAT_QR_TLS_PRIVATE_KEY}`,
          snis: [new URL(`https://${authority}`).hostname],
        },
      ],
    });
    variables = { ...variables, IAM_E2E_WECHAT_QR_TLS_CERT: cert, IAM_E2E_WECHAT_QR_TLS_PRIVATE_KEY: privateKey };
  }
  const publication = await request(`${input.gatewayOrigin}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: input.clientSecret },
    body: JSON.stringify({
      scope: "e2e:iam",
      yaml: Bun.YAML.stringify(source),
      variables,
      prune: true,
    }),
    signal: requestSignal(70_000, input.signal),
  });
  if (!publication.ok)
    throw new Error(
      `E2E Gateway publication failed (HTTP ${publication.status}); inspect Gateway state before retrying`,
    );
  const result = await publication.json();
  if (result.code !== 200 || !["applied", "no_change"].includes(result.data?.outcome))
    throw new Error("E2E Gateway did not confirm publication; inspect Gateway state before retrying");
  const response = await request(`${input.adminUrl}/upstreams/iam.api.e2e`, {
    headers: { "X-API-KEY": input.adminKey },
    signal: requestSignal(10_000, input.signal),
  });
  if (!response.ok) throw new Error("E2E Gateway applied upstream cannot be read back");
  const applied = await response.json();
  if (applied.value?.pass_host !== "rewrite" || applied.value?.upstream_host !== "api.e2e.internal")
    throw new Error("E2E Gateway did not apply the Host rewrite topology");
  return { gatewayHostRewrite: { verified: true, upstream: "iam.api.e2e", host: applied.value.upstream_host } };
}

function requestSignal(timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
