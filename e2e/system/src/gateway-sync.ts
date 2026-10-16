import { createE2EGatewayApiKey } from "./gateway-credential";

export async function publishGateway(
  input: {
    yaml: string;
    variables: Record<string, string>;
    clientSecret: string;
    gatewayOrigin: string;
    adminUrl: string;
    adminKey: string;
  },
  request: (input: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  // Start with the production manifest and publish through its authenticated HTTP API. The
  // test topology rewrites only the API upstream Host; browser authorities and
  // the production route/header policy are unchanged.
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
  for (const [entry, authority] of [
    ["internal", input.variables.IAM_SSO_INTERNAL_HOST],
    ["external", input.variables.IAM_SSO_EXTERNAL_HOST],
  ]) {
    if (!authority) throw new Error(`E2E Gateway ${entry} authority is missing`);
    source.routes.push({
      key: `e2e-rp-${entry}`,
      uris: ["/e2e/custom-sso/callback", "/e2e/business/callback", "/e2e/business/landing"],
      vars: [["http_host", "==", authority]],
      plugins: {
        ...frontend.plugins,
        "proxy-rewrite": { uri: "/portal/e2e-rp.html" },
      },
      upstream: "sso-frontend",
    });
  }
  const publication = await request(`${input.gatewayOrigin}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: input.clientSecret },
    body: JSON.stringify({
      scope: "e2e:iam",
      yaml: Bun.YAML.stringify(source),
      variables: input.variables,
      prune: true,
    }),
    signal: AbortSignal.timeout(70_000),
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
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("E2E Gateway applied upstream cannot be read back");
  const applied = await response.json();
  if (applied.value?.pass_host !== "rewrite" || applied.value?.upstream_host !== "api.e2e.internal")
    throw new Error("E2E Gateway did not apply the Host rewrite topology");
  return { gatewayHostRewrite: { verified: true, upstream: "iam.api.e2e", host: applied.value.upstream_host } };
}

if (import.meta.main) {
  const variableNames = [
    "APISIX_OTEL_COLLECTOR_ENDPOINT",
    "DEV_IAM_API_UPSTREAM_HOST",
    "DEV_IAM_API_UPSTREAM_PORT",
    "DEV_IAM_ADMIN_API_UPSTREAM_HOST",
    "DEV_IAM_ADMIN_API_UPSTREAM_PORT",
    "DEV_IAM_SSO_FRONTEND_UPSTREAM_HOST",
    "DEV_IAM_SSO_FRONTEND_UPSTREAM_PORT",
    "DEV_IAM_ADMIN_FRONTEND_UPSTREAM_HOST",
    "DEV_IAM_ADMIN_FRONTEND_UPSTREAM_PORT",
    "IAM_SSO_INTERNAL_HOST",
    "IAM_SSO_EXTERNAL_HOST",
  ];
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`E2E Gateway configuration missing ${name}`);
    return value;
  };
  try {
    const result = await publishGateway({
      yaml: await Bun.file("apps/gateway/manifests/dev/iam.yaml").text(),
      variables: Object.fromEntries(variableNames.map((name) => [name, required(name)])),
      clientSecret: createE2EGatewayApiKey(required("IAM_E2E_RUN_ID")),
      gatewayOrigin: required("IAM_E2E_GATEWAY_API_ORIGIN"),
      adminUrl: "http://apisix:9180/apisix/admin",
      adminKey: "dev-local-admin-key-change-me",
    });
    console.log(JSON.stringify(result));
  } catch {
    console.error("E2E Gateway publication failed; inspect Gateway and APISIX before retrying");
    process.exitCode = 1;
  }
}
