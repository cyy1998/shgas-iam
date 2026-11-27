export const iamGatewayManifest = new URL("../../../docker/gateway/iam.dev.example.yaml", import.meta.url);

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
  const ssoApi = source.upstreams.find(
    (upstream: unknown) =>
      typeof upstream === "object" && upstream !== null && "key" in upstream && upstream.key === "sso-api",
  );
  if (!ssoApi) throw new Error("E2E Gateway manifest has no SSO API upstream");
  ssoApi.pass_host = "rewrite";
  ssoApi.upstream_host = "sso-api.e2e.internal";
  if (!("routes" in source) || !Array.isArray(source.routes)) throw new Error("E2E Gateway manifest has no routes");
  const frontend = source.routes.find(
    (route: unknown) => typeof route === "object" && route !== null && "key" in route && route.key === "sso-frontend",
  );
  if (!frontend || typeof frontend.plugins !== "object" || frontend.plugins === null)
    throw new Error("E2E Gateway manifest has no frontend logging policy");

  const variables: Record<string, string> = { ...input.variables };
  // Route test-owned RP terminals to the isolated e2e-stubs container so the production SSO image stays untouched.
  if (input.includeRpTerminals !== false) {
    if (
      !source.upstreams.some(
        (upstream: unknown) =>
          typeof upstream === "object" && upstream !== null && "key" in upstream && upstream.key === "e2e-stubs",
      )
    ) {
      source.upstreams.push({
        key: "e2e-stubs",
        type: "roundrobin",
        nodes: { "${E2E_STUBS_UPSTREAM_HOST}:${E2E_STUBS_UPSTREAM_PORT}": 1 },
      });
    }
    variables.E2E_STUBS_UPSTREAM_HOST ??= "e2e-stubs";
    variables.E2E_STUBS_UPSTREAM_PORT ??= "8080";
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
        upstream: "e2e-stubs",
      });
    }
  }
  const mobileHost = input.wecomMobile?.authority ?? input.variables.IAM_SSO_EXTERNAL_HOST;
  if (!mobileHost) throw new Error("E2E Gateway mobile authority is missing");
  variables.IAM_WECHAT_MOBILE_HOST = mobileHost;

  if (input.wecomMobile) {
    const { authority, cert, privateKey } = input.wecomMobile;
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
    Object.assign(variables, { IAM_E2E_WECHAT_QR_TLS_CERT: cert, IAM_E2E_WECHAT_QR_TLS_PRIVATE_KEY: privateKey });
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
  const response = await request(`${input.adminUrl}/upstreams/iam.sso-api.e2e`, {
    headers: { "X-API-KEY": input.adminKey },
    signal: requestSignal(10_000, input.signal),
  });
  if (!response.ok) throw new Error("E2E Gateway applied upstream cannot be read back");
  const applied = await response.json();
  if (applied.value?.pass_host !== "rewrite" || applied.value?.upstream_host !== "sso-api.e2e.internal")
    throw new Error("E2E Gateway did not apply the Host rewrite topology");
  return { gatewayHostRewrite: { verified: true, upstream: "iam.sso-api.e2e", host: applied.value.upstream_host } };
}

function requestSignal(timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
