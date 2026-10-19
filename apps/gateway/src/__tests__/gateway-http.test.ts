import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { ClientStatus } from "@iam/contracts";
import { createGatewayApp } from "../http/app";
import { createGatewayLifecycle } from "../http/lifecycle";
import { createGatewayService } from "../services/gateway/gateway.service";

const yaml =
  "service: {}\nupstreams:\n  - key: api\n    nodes: { 'api:30000': 1 }\nroutes:\n  - key: api\n    uri: /api/*\n    upstream: api\n";

test("a matching enabled Client can validate YAML without contacting APISIX", async () => {
  const service = createGatewayService({
    credentials: {
      async readByClientCode(code) {
        return code === "tender"
          ? { clientSecret: "internal-test-secret", status: ClientStatus.Enable, isDelete: false }
          : null;
      },
    },
  });
  const app = createGatewayApp({ service });
  const response = await app.request("/validate", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: "internal-test-secret" },
    body: JSON.stringify({ scope: "test:tender", yaml }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    code: 200,
    message: "success",
    data: {
      valid: true,
      resources: { routes: 1, upstreams: 1, plugin_metadata: 0, services: 1, plugin_configs: 0, consumers: 0, ssls: 0 },
      issues: [],
    },
  });
});

test("variables are request-local and cannot fall back to server environment", async () => {
  const app = createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode() {
          return { clientSecret: "key", status: ClientStatus.Enable, isDelete: false };
        },
      },
    }),
  });
  const variableYaml =
    "service: {}\nupstreams:\n  - key: api\n    nodes: { '${IAM_GATEWAY_VARIABLE_TEST}:30000': 1 }\nroutes:\n  - key: api\n    upstream: api\n    uri: /api/*\n";
  const request = (variables?: Record<string, string>) =>
    app.request("/validate", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "key" },
      body: JSON.stringify({ scope: "test:tender", yaml: variableYaml, variables }),
    });
  process.env.IAM_GATEWAY_VARIABLE_TEST = "server-value";
  try {
    const first = await request({ IAM_GATEWAY_VARIABLE_TEST: "request-value" });
    expect(first.status).toBe(200);
    const second = await request();
    expect(second.status).toBe(400);
    expect(process.env.IAM_GATEWAY_VARIABLE_TEST).toBe("server-value");
  } finally {
    delete process.env.IAM_GATEWAY_VARIABLE_TEST;
  }
});

test("HTTP input size is bounded even when Content-Length is absent", async () => {
  const app = createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode() {
          throw new Error("must not read");
        },
      },
    }),
    maxRequestBytes: 32,
  });
  const response = await app.request("/validate", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: "key" },
    body: JSON.stringify({ scope: "test:tender", yaml }),
  });
  expect(response.status).toBe(413);
});

test("shutdown rejects new work and drains an already authenticated request", async () => {
  const lifecycle = createGatewayLifecycle();
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = createGatewayApp({
    lifecycle,
    service: createGatewayService({
      credentials: {
        async readByClientCode() {
          started();
          await gate;
          return { clientSecret: "key", status: ClientStatus.Enable, isDelete: false };
        },
      },
    }),
  });
  const request = () =>
    app.request("/validate", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "key" },
      body: JSON.stringify({ scope: "test:tender", yaml }),
    });
  const first = request();
  await entered;
  lifecycle.beginShutdown();
  let drained = false;
  const drain = lifecycle.drain().then(() => {
    drained = true;
  });
  try {
    const rejected = await request();
    expect(rejected.status).toBe(503);
    const health = await app.request("/health");
    expect(health.status).toBe(503);
    expect(drained).toBe(false);
  } finally {
    release();
  }
  const completed = await first;
  expect(completed.status).toBe(200);
  await drain;
  expect(drained).toBe(true);
});

test("authentication failures are uniform and datasource errors do not escape", async () => {
  let current: { clientSecret: string; status: ClientStatus; isDelete: boolean } | null = {
    clientSecret: "key",
    status: ClientStatus.Enable,
    isDelete: false,
  };
  let unavailable = false;
  const app = createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode(code) {
          if (unavailable) throw new Error("postgresql://do-not-disclose");
          return code === "tender" ? current : null;
        },
      },
    }),
  });
  const request = (scope: string, secret?: string) =>
    app.request("/validate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { apikey: secret } : {}),
        Client: "tender",
        Authorization: "key",
      },
      body: JSON.stringify({ scope, yaml }),
    });
  for (const [scope, secret] of [
    ["test:tender", undefined],
    ["test:tender", "sso-secret"],
    ["test:other", "key"],
  ]) {
    const response = await request(scope!, secret);
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toEqual({ code: "GATEWAY_UNAUTHORIZED", message: "Client authentication failed", data: null });
  }
  for (const status of [ClientStatus.Maintenance, ClientStatus.Disable]) {
    current = { clientSecret: "key", status, isDelete: false };
    const response = await request("test:tender", "key");
    expect(response.status).toBe(401);
  }
  current = { clientSecret: "key", status: ClientStatus.Enable, isDelete: true };
  const deleted = await request("test:tender", "key");
  expect(deleted.status).toBe(401);
  unavailable = true;
  const failure = await request("test:tender", "key");
  const text = await failure.text();
  expect(failure.status).toBe(503);
  expect(text).not.toContain("do-not-disclose");
});

test("invalid JSON, scope, YAML and references are safe and cannot select server paths or targets", async () => {
  const app = createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode() {
          return { clientSecret: "key", status: ClientStatus.Enable, isDelete: false };
        },
      },
    }),
  });
  const secret = "private-value-must-not-escape";
  for (const body of [
    `{ "${secret}": `,
    JSON.stringify({ scope: secret, yaml }),
    JSON.stringify({ scope: "test:tender", yaml: `[${secret}` }),
    JSON.stringify({ scope: "test:tender", yaml: "service: {}\nservice: {}\n" }),
    JSON.stringify({ scope: "test:tender", yaml: `service: {}\nroutes:\n  - key: api\n    upstream: ${secret}\n` }),
    JSON.stringify({
      scope: "test:tender",
      yaml: `service: {}\nconsumers:\n  - key: api\n    plugins:\n      key-auth: { key: ${secret} }\n`,
    }),
    JSON.stringify({ scope: "test:tender", yaml, manifest: "C:/server/secret.yaml" }),
    JSON.stringify({ scope: "test:tender", yaml, adminUrl: "http://other-target" }),
    JSON.stringify({ scope: "test:tender", yaml, variables: { HOST: 123 } }),
  ]) {
    const response = await app.request("/validate", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "key" },
      body,
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain(secret);
  }
  for (const endpoint of ["/missing"]) {
    const response = await app.request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "key" },
      body: JSON.stringify({ scope: "test:tender", yaml }),
    });
    expect(response.status).toBe(404);
  }
});

test("all seven resource kinds accept external secret variables and return only counts", async () => {
  const app = createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode() {
          return { clientSecret: "key", status: ClientStatus.Enable, isDelete: false };
        },
      },
    }),
  });
  const source =
    "service:\n  plugin_configs:\n    - key: shared\n      plugins: {}\nupstreams:\n  - key: api\n    nodes: { 'api:30000': 1 }\nplugin_metadata:\n  - key: opentelemetry\n    batch_span_processor: {}\nroutes:\n  - key: api\n    uri: /api/*\n    upstream: api\n    plugin_config: shared\nconsumers:\n  - key: internal\n    plugins:\n      key-auth: { key: '${API_KEY}' }\nssls:\n  - key: tls\n    cert: '${CERT}'\n    private_key: '${PRIVATE_KEY}'\n";
  const response = await app.request("/validate", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: "key" },
    body: JSON.stringify({
      scope: "test:tender",
      yaml: source,
      variables: { API_KEY: "synthetic-api-key", CERT: "synthetic-cert", PRIVATE_KEY: "synthetic-private-key" },
    }),
  });
  const text = await response.text();
  expect({ status: response.status, text }).toMatchObject({ status: 200 });
  expect(JSON.parse(text).data.resources).toEqual({
    services: 1,
    plugin_configs: 1,
    upstreams: 1,
    plugin_metadata: 1,
    routes: 1,
    consumers: 1,
    ssls: 1,
  });
  expect(text).not.toContain("synthetic-");
});

function createValidationApp() {
  return createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode() {
          return { clientSecret: "key", status: ClientStatus.Enable, isDelete: false };
        },
      },
    }),
  });
}

test("ordinary metadata key values validate consistently with literal and request variable input", async () => {
  const app = createValidationApp();
  for (const value of ["canary", "${LABEL}"]) {
    const response = await app.request("/validate", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "key" },
      body: JSON.stringify({
        scope: "test:tender",
        yaml: `service:\n  labels:\n    key: ${value}\n  plugins:\n    limit-req:\n      key: remote_addr\n`,
        variables: { LABEL: "canary" },
      }),
    });
    const body = await response.json();
    expect({ value, status: response.status, data: body.data }).toEqual({
      value,
      status: 200,
      data: {
        valid: true,
        resources: {
          routes: 0,
          upstreams: 0,
          plugin_metadata: 0,
          services: 1,
          plugin_configs: 0,
          consumers: 0,
          ssls: 0,
        },
        issues: [],
      },
    });
  }
});

test("inline credentials and private keys remain invalid without disclosing their values", async () => {
  const app = createValidationApp();
  const secret = "credential-value-must-not-escape";
  for (const source of [
    `service: {}\nconsumers:\n  - key: api\n    plugins:\n      key-auth: { key: ${secret} }\n`,
    `service: {}\nconsumers:\n  - key: api\n    credentials:\n      - type: key-auth\n        config: { key: ${secret} }\n`,
    `service: {}\nssls:\n  - key: tls\n    cert: certificate\n    private_key: ${secret}\n`,
    `service:\n  plugins:\n    jwt-auth: { secret: ${secret} }\n`,
    `service:\n  labels:\n    key: '-----BEGIN PRIVATE KEY-----${secret}'\n`,
  ]) {
    const response = await app.request("/validate", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "key" },
      body: JSON.stringify({ scope: "test:tender", yaml: source }),
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(JSON.parse(text).code).toBe("GATEWAY_VALIDATION_FAILED");
    expect(text).not.toContain(secret);
  }
});

test("validation preserves a stable code and the safe correction for misplaced plugin configs", async () => {
  const app = createValidationApp();
  const response = await app.request("/validate", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: "key" },
    body: JSON.stringify({ scope: "test:tender", yaml: "service: {}\nplugin_configs: []\n" }),
  });
  const body = await response.json();
  expect(response.status).toBe(400);
  expect(body.data.issues).toEqual([
    {
      code: "PLUGIN_CONFIGS_LOCATION",
      path: "plugin_configs",
      message: "top-level plugin_configs are not allowed; use service.plugin_configs",
    },
  ]);
});

test("validation codes cannot be influenced by caller values or disclose dynamic field names", async () => {
  const app = createValidationApp();
  const secret = "private_key=do-not-disclose";
  const response = await app.request("/validate", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: "key" },
    body: JSON.stringify({
      scope: "test:tender",
      yaml: `service:\n  plugins:\n    '${secret}':\n      password: '${secret}'\nroutes:\n  - key: '${secret}'\n    upstream: '${secret}'\n`,
    }),
  });
  const text = await response.text();
  const body = JSON.parse(text);
  expect(response.status).toBe(400);
  expect(text).not.toContain(secret);
  expect(body.data.issues).toContainEqual({
    code: "LOCAL_KEY_INVALID",
    path: "routes[0]",
    message: "Resource keys must be lowercase kebab-case segments",
  });
  expect(body.data.issues).toContainEqual({
    code: "REFERENCE_NOT_FOUND",
    path: "routes[0]",
    message: "Resource references a missing target",
  });
  expect(body.data.issues.some((issue: { code: string }) => issue.code === "SSL_MATERIAL_REQUIRED")).toBe(false);
});

test("IAM, Tender and GDS representative manifests remain valid through HTTP", async () => {
  const app = createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode() {
          return { clientSecret: "key", status: ClientStatus.Enable, isDelete: false };
        },
      },
    }),
  });
  for (const stage of ["dev", "prod"])
    for (const client of ["iam", "tender", "gds"]) {
      const source = await readFile(new URL(`../../manifests/${stage}/${client}.yaml`, import.meta.url), "utf8");
      const variables = Object.fromEntries(
        [...source.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((match) => {
          const name = match[1]!;
          return [
            name,
            name.includes("CIDR")
              ? "10.0.0.0/24"
              : name.endsWith("PORT")
                ? "30000"
                : name.endsWith("URL")
                  ? "http://api:30000/auth"
                  : name.includes("COLLECTOR")
                    ? "collector:4318"
                    : "api.internal",
          ];
        }),
      );
      const response = await app.request("/validate", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "key" },
        body: JSON.stringify({ scope: `${stage}:${client}`, yaml: source, variables }),
      });
      const body = await response.json();
      expect({ scope: `${stage}:${client}`, status: response.status, valid: body.data?.valid }).toEqual({
        scope: `${stage}:${client}`,
        status: 200,
        valid: true,
      });
    }
});
