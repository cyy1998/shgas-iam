async function publishGateway() {
  // Start with the production manifest and publish through its normal CLI. The
  // test topology rewrites only the API upstream Host; browser authorities and
  // the production route/header policy are unchanged.
  const source = Bun.YAML.parse(await Bun.file("gateway/manifests/dev/iam.yaml").text());
  if (typeof source !== "object" || source === null || !("upstreams" in source) || !Array.isArray(source.upstreams))
    throw new Error("E2E Gateway manifest has no upstreams");
  const api = source.upstreams.find((upstream: unknown) => typeof upstream === "object" && upstream !== null && "key" in upstream && upstream.key === "api");
  if (!api)
    throw new Error("E2E Gateway manifest has no API upstream");
  api.pass_host = "rewrite";
  api.upstream_host = "api.e2e.internal";
  if (!("routes" in source) || !Array.isArray(source.routes))
    throw new Error("E2E Gateway manifest has no routes");
  const frontend = source.routes.find((route: unknown) => typeof route === "object" && route !== null && "key" in route && route.key === "sso-frontend");
  if (!frontend || typeof frontend.plugins !== "object" || frontend.plugins === null)
    throw new Error("E2E Gateway manifest has no frontend logging policy");
  // These test-owned RP terminals only receive completed protocol navigation.
  // The static upstream has no IAM logic or browser script that can redirect.
  for (const [entry, authority] of [
    ["internal", process.env.IAM_SSO_INTERNAL_HOST],
    ["external", process.env.IAM_SSO_EXTERNAL_HOST],
  ]) {
    if (!authority)
      throw new Error(`E2E Gateway ${entry} authority is missing`);
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
  const manifest = "/tmp/iam-e2e-gateway.json";
  await Bun.write(manifest, JSON.stringify(source));
  const child = Bun.spawn([process.execPath, "gateway/src/cli.ts", "apply", "--env", "e2e:iam", "--manifest", manifest, "--render-env", "--admin-url", "http://apisix:9180/apisix/admin", "--admin-key", "dev-local-admin-key-change-me", "--prune", "--json"], { stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0)
    throw new Error("E2E Gateway publication failed");
  const response = await fetch("http://apisix:9180/apisix/admin/upstreams/iam.api.e2e", {
    headers: { "X-API-KEY": "dev-local-admin-key-change-me" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error("E2E Gateway applied upstream cannot be read back");
  const applied = await response.json();
  if (applied.value?.pass_host !== "rewrite" || applied.value?.upstream_host !== "api.e2e.internal")
    throw new Error("E2E Gateway did not apply the Host rewrite topology");
  console.log(JSON.stringify({ gatewayHostRewrite: { verified: true, upstream: "iam.api.e2e", host: applied.value.upstream_host } }));
}

publishGateway().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
