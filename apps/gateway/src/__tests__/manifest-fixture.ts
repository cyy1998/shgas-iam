// Synthetic caller input for Gateway behavior tests; not a deployment baseline.
export function createManifestSource() {
  const telemetry = {
    "request-id": { header_name: "X-Request-Id", include_in_response: true },
    opentelemetry: { sampler: { name: "always_on" } },
  };
  return {
    service: {
      desc: "Synthetic application",
      plugin_configs: [
        { key: "api", plugins: telemetry },
        { key: "browser", plugins: { ...telemetry, cors: { allow_origins: "${BROWSER_ORIGIN}" } } },
      ],
    },
    plugin_metadata: [
      { key: "opentelemetry", set_ngx_var: true, collector: { address: "${COLLECTOR}", request_timeout: 3 } },
    ],
    upstreams: [
      { key: "api", nodes: { "${API_HOST}:${API_PORT}": 1 } },
      { key: "frontend", nodes: { "frontend.example.test:8080": 1 } },
    ],
    routes: [
      {
        key: "browser",
        uri: "/sso/*",
        hosts: ["${PUBLIC_HOST}", "${PRIVATE_HOST}"],
        upstream: "api",
        plugin_config: "browser",
      },
      {
        key: "authority",
        uris: ["/oidc", "/oidc/*"],
        vars: [["http_host", "==", "${AUTHORITY}"]],
        upstream: "api",
        plugin_config: "api",
        plugins: {
          "proxy-rewrite": {
            headers: { set: { "X-IAM-Entry-Network": "internal", "X-Forwarded-Host": "$http_host" } },
          },
        },
      },
      { key: "token", uri: "/sso/token", priority: 100, upstream: "api", plugin_config: "api" },
      {
        key: "frontend",
        uri: "/workspace/*",
        upstream: "frontend",
        plugin_config: "api",
        plugins: {
          "forward-auth": {
            uri: "${AUTHZ_URL}",
            allow_degradation: false,
            request_headers: ["apikey"],
            upstream_headers: ["X-User-Info"],
          },
          "proxy-rewrite": { regex_uri: ["^/workspace/(.*)", "/$1"], headers: { remove: ["X-User-Info"] } },
        },
      },
      {
        key: "redirect",
        uri: "/workspace",
        terminal: true,
        plugins: { ...telemetry, redirect: { uri: "/workspace/", ret_code: 302, append_query_string: true } },
      },
    ],
  };
}

export function createManifestVariables() {
  return {
    API_HOST: "api.example.test",
    API_PORT: "30000",
    PUBLIC_HOST: "public.example.test",
    PRIVATE_HOST: "private.example.test",
    AUTHORITY: "127.0.0.1:43123",
    BROWSER_ORIGIN: "https://public.example.test",
    AUTHZ_URL: "http://auth.example.test:8080/auth",
    COLLECTOR: "collector.example.test:4318",
  };
}
