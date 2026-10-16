import { expect, test } from "bun:test";
import { ClientStatus } from "@iam/contracts";
import { ApisixAdminClient } from "../apisix-admin-client";
import { createGatewayApp } from "../http/app";
import { createEmptyResourceMap, getDefinition, getResourceId } from "../resources";
import { createGatewayService } from "../services/gateway/gateway.service";
import type { FetchLike, ManifestObject, ResourceKind } from "../types";

const yaml =
  "service: {}\nupstreams:\n  - key: api\n    nodes: { 'api:30000': 1 }\nroutes:\n  - key: api\n    uri: /api/*\n    upstream: api\n";
const labels = { managed_by: "shgas-iam", source: "repo-manifest", env: "test", app: "tender" };
type Write = { method: string; kind: ResourceKind; id: string; value?: ManifestObject };

function fixture(options: { requestTimeoutMs?: number; operationTimeoutMs?: number } = {}) {
  const state = createEmptyResourceMap();
  const writes: Write[] = [];
  const methods: string[] = [];
  let effect: ((write: Write, forward: () => Response) => Promise<Response>) | undefined;
  let credential = { clientSecret: "client-secret", status: ClientStatus.Enable, isDelete: false };
  let childCredentials: unknown = { total: 0, list: {} };
  const fetch: FetchLike = async (input, init) => {
    methods.push(init?.method ?? "GET");
    const url = new URL(String(input));
    if (init?.method === "GET" && url.pathname.endsWith("/credentials")) {
      if (childCredentials instanceof Error) throw childCredentials;
      if (childCredentials instanceof Response) return childCredentials;
      return Response.json(childCredentials);
    }
    const [kind, id] = url.pathname.replace("/apisix/admin/", "").split("/") as [ResourceKind, string | undefined];
    const values = state[kind];
    if (init?.method === "GET")
      return Response.json({
        total: values.length,
        list: values.map((value) => ({ key: `/apisix/${kind}/${getResourceId(getDefinition(kind), value)}`, value })),
      });
    if (!id) throw new Error("Write requires an identity");
    const write = {
      method: init?.method ?? "GET",
      kind,
      id,
      value: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    writes.push(write);
    const forward = () => {
      const index = values.findIndex((value) => getResourceId(getDefinition(kind), value) === id);
      if (index >= 0) values.splice(index, 1);
      if (write.method === "PUT") values.push(structuredClone(write.value!));
      return Response.json(
        write.method === "PUT"
          ? { key: `/apisix/${kind}/${id}`, value: structuredClone(write.value) }
          : { key: `/apisix/${kind}/${id}`, deleted: "1" },
      );
    };
    return effect ? effect(write, forward) : forward();
  };
  const client = new ApisixAdminClient({
    adminUrl: "http://apisix.invalid/apisix/admin",
    adminKey: "admin-secret",
    fetch,
    ...options,
  });
  const service = createGatewayService({
    credentials: { readByClientCode: async () => credential },
    remote: client,
    writer: client,
    operationTimeoutMs: options.operationTimeoutMs,
  });
  const app = createGatewayApp({ service });
  return {
    state,
    writes,
    methods,
    client,
    app,
    intercept(callback: NonNullable<typeof effect>) {
      effect = callback;
    },
    setCredential(value: typeof credential) {
      credential = value;
    },
    setChildCredentials(value: unknown) {
      childCredentials = value;
    },
    request(extra = {}) {
      return app.request("/apply", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "client-secret" },
        body: JSON.stringify({ scope: "test:tender", yaml, ...extra }),
      });
    },
  };
}

test("formal HTTP apply publishes once, replans and reports no change without pruning candidates", async () => {
  const f = fixture();
  f.state.routes.push({ id: "tender.old.test", uri: "/old", labels });
  const published = await f.request();
  const body = await published.json();
  expect(published.status).toBe(200);
  expect(body.data).toMatchObject({ outcome: "applied", written: true, dryRun: false, prune: false });
  expect(f.writes.map((write) => [write.method, write.kind, write.id])).toEqual([
    ["PUT", "upstreams", "tender.api.test"],
    ["PUT", "services", "tender.test"],
    ["PUT", "routes", "tender.api.test"],
  ]);
  const next = await f.request();
  const nextBody = await next.json();
  expect(next.status).toBe(200);
  expect(nextBody.data).toMatchObject({ outcome: "no_change", written: false });
  expect(f.writes).toHaveLength(3);
  expect(f.state.routes.some((route) => route.id === "tender.old.test")).toBe(true);
});

test("a rejected create restores every attempted target, preserves non-targets and allows the next apply", async () => {
  const f = fixture();
  f.state.routes.push({ id: "manual", uri: "/untouched", plugins: { "key-auth": { key: "remote-secret" } } });
  const before = structuredClone(f.state);
  let rejected = false;
  f.intercept(async (write, forward) => {
    if (!rejected && write.method === "PUT" && write.kind === "routes") {
      rejected = true;
      return new Response("private-remote-error", { status: 400 });
    }
    return forward();
  });
  const response = await f.request();
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body).toMatchObject({ code: "GATEWAY_APPLY_ROLLED_BACK", data: { outcome: "rolled_back" } });
  expect(JSON.stringify(body)).not.toMatch(/private-remote-error|remote-secret|client-secret|admin-secret/);
  expect(f.state).toEqual(before);
  expect(f.writes.map((write) => [write.method, write.kind])).toEqual([
    ["PUT", "upstreams"],
    ["PUT", "services"],
    ["PUT", "routes"],
    ["DELETE", "routes"],
    ["DELETE", "services"],
    ["DELETE", "upstreams"],
  ]);
  const next = await f.request();
  expect(next.status).toBe(200);
});

test.each(["update", "delete"])("a rejected %s restores the previous configuration", async (mode) => {
  const f = fixture();
  f.state.services.push({ id: "tender.test", name: "old-service", labels });
  f.state.routes.push({ id: "tender.old.test", uri: "/old", labels, service_id: "tender.test" });
  const before = structuredClone(f.state);
  let rejected = false;
  f.intercept(async (write, forward) => {
    if (
      !rejected &&
      (mode === "update"
        ? write.kind === "services" && write.method === "PUT"
        : write.kind === "routes" && write.method === "DELETE")
    ) {
      rejected = true;
      return new Response("rejected", { status: 400 });
    }
    return forward();
  });
  const response = await f.request({ prune: true });
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body.data.outcome).toBe("rolled_back");
  expect(f.state).toEqual(before);
});

test.each(["network", "body", "json", "server-error"])(
  "an applied write with %s failure is compensated but remains unknown and blocks this instance",
  async (mode) => {
    const f = fixture();
    let lost = false;
    f.intercept(async (write, forward) => {
      if (!lost && write.kind === "upstreams" && write.method === "PUT") {
        lost = true;
        forward();
        if (mode === "network") throw new Error("private-network-secret");
        if (mode === "body")
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("private-body-secret"));
              },
            }),
          );
        return new Response("private-json-secret", { status: mode === "server-error" ? 500 : 200 });
      }
      return forward();
    });
    const response = await f.request();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: "GATEWAY_APPLY_UNKNOWN", data: { outcome: "unknown" } });
    expect(f.state.upstreams).toEqual([]);
    expect(f.writes.map((write) => write.method)).toEqual(["PUT", "DELETE"]);
    expect(JSON.stringify(body)).not.toMatch(/secret/);
    const remoteRequests = f.methods.length;
    const blocked = await f.request();
    expect(blocked.status).toBe(503);
    expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
    expect(f.writes).toHaveLength(2);
    expect(f.methods).toHaveLength(remoteRequests);
  },
);

test.each(["rejected", "network"])("a %s compensation continues other inverses once and blocks", async (mode) => {
  const f = fixture();
  f.intercept(async (write, forward) => {
    if (write.kind === "routes" && write.method === "PUT") return new Response("denied", { status: 400 });
    if (write.kind === "routes" && write.method === "DELETE") {
      if (mode === "network") throw new Error("connection lost");
      return new Response("denied", { status: 403 });
    }
    return forward();
  });
  const response = await f.request();
  const body = await response.json();
  expect(body.code).toBe(mode === "network" ? "GATEWAY_APPLY_UNKNOWN" : "GATEWAY_ROLLBACK_FAILED");
  expect(f.writes.map((write) => [write.method, write.kind])).toEqual([
    ["PUT", "upstreams"],
    ["PUT", "services"],
    ["PUT", "routes"],
    ["DELETE", "routes"],
    ["DELETE", "services"],
    ["DELETE", "upstreams"],
  ]);
  const blocked = await f.request();
  expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
});

test("an incomplete TLS pre-state rejects the entire write set without blocking", async () => {
  const f = fixture();
  f.state.ssls.push({ id: "tender.tls.test", cert: "certificate", labels });
  const response = await f.request({ prune: true });
  expect(response.status).toBe(502);
  expect((await response.json()).code).toBe("GATEWAY_SNAPSHOT_INVALID");
  expect(f.writes).toEqual([]);
  f.state.ssls.length = 0;
  const next = await f.request();
  expect(next.status).toBe(200);
});

test("an upstream pre-state without a routing target rejects before any write and does not block the next apply", async () => {
  const f = fixture();
  f.state.upstreams.push({ id: "tender.api.test", labels });
  const before = structuredClone(f.state);
  f.intercept(async (write, forward) => {
    if (write.method === "PUT" && (write.kind === "routes" || (write.kind === "upstreams" && !write.value?.nodes)))
      return new Response("invalid resource", { status: 400 });
    return forward();
  });
  const response = await f.request();
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body.code).toBe("GATEWAY_SNAPSHOT_INVALID");
  expect(f.writes).toEqual([]);
  expect(f.state).toEqual(before);
  f.state.upstreams[0]!.nodes = { "old:30000": 1 };
  f.intercept(async (_write, forward) => forward());
  const next = await f.request();
  expect(next.status).toBe(200);
  expect((await next.json()).data.outcome).toBe("applied");
});

test.each([
  { name: "null upstream nodes", kind: "upstreams", value: { id: "old", nodes: null } },
  { name: "an upstream node without its weight", kind: "upstreams", value: { id: "old", nodes: [{ host: "old" }] } },
  { name: "negative upstream node weight", kind: "upstreams", value: { id: "old", nodes: { "old:80": -1 } } },
  { name: "incomplete upstream discovery", kind: "upstreams", value: { id: "old", service_name: "api" } },
  {
    name: "ambiguous upstream routing",
    kind: "upstreams",
    value: { id: "old", nodes: {}, service_name: "api", discovery_type: "dns" },
  },
  { name: "a route without a URI", kind: "routes", value: { id: "old", plugins: {} } },
  { name: "empty route URIs", kind: "routes", value: { id: "old", uris: [], plugins: {} } },
  { name: "ambiguous route URIs", kind: "routes", value: { id: "old", uri: "/old", uris: ["/old"], plugins: {} } },
  { name: "a route without an action", kind: "routes", value: { id: "old", uri: "/old" } },
  { name: "a plugin config without plugins", kind: "plugin_configs", value: { id: "old" } },
  { name: "a malformed plugin config", kind: "plugin_configs", value: { id: "old", plugins: [] } },
  { name: "a malformed service plugin map", kind: "services", value: { id: "old", plugins: [] } },
  { name: "an incomplete service upstream", kind: "services", value: { id: "old", upstream: {} } },
  { name: "an incomplete route upstream", kind: "routes", value: { id: "old", uri: "/old", upstream: {} } },
  { name: "an invalid consumer username", kind: "consumers", value: { username: "old.invalid" } },
  { name: "a malformed consumer plugin map", kind: "consumers", value: { username: "old", plugins: [] } },
  { name: "server TLS without SNI", kind: "ssls", value: { id: "old", cert: "certificate", key: "encrypted-key" } },
  {
    name: "ambiguous server TLS SNI",
    kind: "ssls",
    value: { id: "old", cert: "certificate", key: "encrypted-key", sni: "old.invalid", snis: ["old.invalid"] },
  },
  {
    name: "incomplete TLS client verification",
    kind: "ssls",
    value: { id: "old", cert: "certificate", key: "encrypted-key", snis: ["old.invalid"], client: {} },
  },
] satisfies Array<{ name: string; kind: ResourceKind; value: ManifestObject }>)(
  "$name in the write set rejects the entire operation before publishing and leaves the instance usable",
  async ({ kind, value }) => {
    const f = fixture();
    f.state[kind].push({ ...value, labels });
    const before = structuredClone(f.state);
    const response = await f.request({ prune: true });
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("GATEWAY_SNAPSHOT_INVALID");
    expect(f.writes).toEqual([]);
    expect(f.state).toEqual(before);
    f.state[kind].length = 0;
    const next = await f.request();
    expect(next.status).toBe(200);
  },
);

test.each([
  { name: "empty node maps", kind: "upstreams", value: { id: "old", nodes: {} } },
  { name: "empty node arrays", kind: "upstreams", value: { id: "old", nodes: [] } },
  {
    name: "node arrays without an optional port",
    kind: "upstreams",
    value: { id: "old", nodes: [{ host: "old", weight: 1 }] },
  },
  { name: "discovery upstreams", kind: "upstreams", value: { id: "old", service_name: "old", discovery_type: "dns" } },
  { name: "multiple route URIs", kind: "routes", value: { id: "old", uris: ["/old", "/prior"], plugins: {} } },
  { name: "a service with no optional configuration", kind: "services", value: { id: "old" } },
  { name: "an empty plugin config", kind: "plugin_configs", value: { id: "old", plugins: {} } },
  {
    name: "plugin-owned metadata",
    kind: "plugin_metadata",
    value: { id: "opentelemetry", resource: { nested: { key: "opaque-value" } } },
  },
  { name: "a consumer with no optional configuration", kind: "consumers", value: { username: "old" } },
  {
    name: "server TLS with an opaque encrypted key",
    kind: "ssls",
    value: { id: "old", cert: "certificate", key: "encrypted-key", sni: "old.invalid" },
  },
  {
    name: "client TLS without SNI",
    kind: "ssls",
    value: { id: "old", type: "client", cert: "certificate", key: "encrypted-key" },
  },
] satisfies Array<{ name: string; kind: ResourceKind; value: ManifestObject }>)(
  "$name remain writable without requiring optional fields or interpreting opaque values",
  async ({ kind, value }) => {
    const f = fixture();
    f.state[kind].push({ ...value, labels });
    const before = structuredClone(f.state);
    let rejected = false;
    f.intercept(async (write, forward) => {
      if (!rejected && write.method === "DELETE" && write.kind === kind) {
        rejected = true;
        return new Response("controlled failure", { status: 400 });
      }
      return forward();
    });
    const response = await f.request({ prune: true });
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("GATEWAY_APPLY_ROLLED_BACK");
    expect(rejected).toBe(true);
    expect(f.state).toEqual(before);
    expect(
      f.writes.some(
        (write) => write.method === "PUT" && write.kind === kind && write.id === (value.id ?? value.username),
      ),
    ).toBe(true);
  },
);

test.each([
  { total: 1, list: [{}] },
  { total: 0 },
  { total: 0, list: { unknown: true } },
  new Error("private-reader-failure"),
  Response.json({ message: "Unknown endpoint" }, { status: 404 }),
])("consumer child credentials must be confirmed absent before any prune write: %j", async (credentials) => {
  const f = fixture();
  f.state.consumers.push({ username: "tender_old_test", labels, plugins: {} });
  f.setChildCredentials(credentials);
  const response = await f.request({ prune: true });
  expect(response.status).toBe(502);
  expect((await response.json()).code).toBe("GATEWAY_SNAPSHOT_INVALID");
  expect(f.writes).toEqual([]);
  f.setChildCredentials({ total: 0, list: {} });
  const next = await f.request({ prune: true });
  expect(next.status).toBe(200);
});

test("only the APISIX Key not found credential response confirms an absent child collection", async () => {
  const f = fixture();
  f.state.consumers.push({ username: "tender_old_test", labels, plugins: {} });
  f.setChildCredentials(Response.json({ message: "Key not found" }, { status: 404 }));
  const response = await f.request({ prune: true });
  expect(response.status).toBe(200);
  expect(f.state.consumers).toEqual([]);
});

test("a late original write cannot turn a matching compensation into a rolled-back result", async () => {
  const f = fixture({ requestTimeoutMs: 10, operationTimeoutMs: 1000 });
  let settle!: () => void;
  let originalFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    originalFinished = resolve;
  });
  f.intercept((write, forward) => {
    if (write.method === "PUT")
      return new Promise<Response>((resolve) => {
        settle = () => {
          resolve(forward());
          originalFinished();
        };
      });
    return Promise.resolve(forward());
  });
  const response = await f.request();
  expect((await response.json()).data.outcome).toBe("unknown");
  expect(f.state.upstreams).toEqual([]);
  settle();
  await finished;
  expect(f.state.upstreams).toHaveLength(1);
  const blocked = await f.request();
  expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
  expect(f.writes.map((write) => write.method)).toEqual(["PUT", "DELETE"]);
});

test("exhausting the total execution budget reports unknown and blocks rather than extending recovery", async () => {
  const f = fixture({ requestTimeoutMs: 1000, operationTimeoutMs: 15 });
  f.intercept(async () => new Promise<Response>(() => {}));
  const response = await f.request();
  expect((await response.json()).code).toBe("GATEWAY_APPLY_UNKNOWN");
  expect(f.writes.map((write) => write.method)).toEqual(["PUT"]);
  const blocked = await f.request();
  expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
});

test("SSL source uses a local key and maps only the external private_key to the APISIX TLS key", async () => {
  const f = fixture();
  const response = await f.request({
    yaml: "service: {}\nssls:\n  - key: tls\n    cert: ${TLS_CERT}\n    private_key: ${TLS_PRIVATE_KEY}\n    snis: [gateway.invalid]\n",
    variables: { TLS_CERT: "synthetic-certificate", TLS_PRIVATE_KEY: "synthetic-private-key" },
  });
  expect(response.status).toBe(200);
  expect(f.state.ssls).toEqual([
    {
      id: "tender.tls.test",
      cert: "synthetic-certificate",
      key: "synthetic-private-key",
      snis: ["gateway.invalid"],
      labels,
    },
  ]);
  expect(JSON.stringify(await response.json())).not.toMatch(/synthetic|private_key/);
});

test("an SSL source without private_key is rejected before contacting APISIX", async () => {
  const f = fixture();
  const response = await f.request({
    yaml: "service: {}\nssls:\n  - key: tls\n    cert: ${TLS_CERT}\n    snis: [gateway.invalid]\n",
    variables: { TLS_CERT: "certificate" },
  });
  expect(response.status).toBe(400);
  expect(f.methods).toEqual([]);
});

test("Consumer usernames use APISIX-compatible separators while other resource identities stay stable", async () => {
  const f = fixture();
  const response = await f.request({
    yaml: `${yaml}consumers:\n  - key: api\n    plugins:\n      key-auth:\n        key: \u0024{CONSUMER_KEY}\n`,
    variables: { CONSUMER_KEY: "consumer-secret" },
  });
  expect(response.status).toBe(200);
  expect(f.state.consumers).toEqual([
    { username: "tender_api_test", plugins: { "key-auth": { key: "consumer-secret" } }, labels },
  ]);
  expect(f.state.upstreams[0]?.id).toBe("tender.api.test");
  expect(f.state.services[0]?.id).toBe("tender.test");
  expect(f.state.routes[0]?.id).toBe("tender.api.test");
});

test.each(["publishing", "compensating"])(
  "busy covers the %s phase and does not queue or write a second apply",
  async (phase) => {
    const f = fixture();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waited = false;
    f.intercept(async (write, forward) => {
      if (phase === "compensating" && write.method === "PUT" && write.kind === "routes")
        return new Response("denied", { status: 400 });
      if (!waited && (phase === "publishing" ? write.method === "PUT" : write.method === "DELETE")) {
        waited = true;
        entered();
        await gate;
      }
      return forward();
    });
    const pending = f.request();
    await started;
    try {
      const count = f.methods.length;
      const busy = await f.request();
      expect(busy.status).toBe(409);
      expect((await busy.json()).code).toBe("GATEWAY_BUSY");
      expect(f.methods).toHaveLength(count);
      if (phase === "publishing") {
        const independent = await fixture().request();
        expect(independent.status).toBe(200);
      }
    } finally {
      release();
    }
    const completed = await pending;
    expect(completed.status).toBe(phase === "publishing" ? 200 : 502);
  },
);

test("an authenticated operation finishes after credential disablement while the next request reauthenticates", async () => {
  const f = fixture();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waited = false;
  f.intercept(async (_write, forward) => {
    if (!waited) {
      waited = true;
      entered();
      await gate;
    }
    return forward();
  });
  const pending = f.request();
  await started;
  f.setCredential({ clientSecret: "rotated-secret", status: ClientStatus.Disable, isDelete: false });
  release();
  const completed = await pending;
  expect(completed.status).toBe(200);
  const count = f.methods.length;
  const rejected = await f.request();
  expect(rejected.status).toBe(401);
  expect(f.methods).toHaveLength(count);
});

test("the total deadline also bounds compensation and leaves the instance blocked", async () => {
  const f = fixture({ requestTimeoutMs: 1000, operationTimeoutMs: 20 });
  f.intercept(async (write, forward) => {
    if (write.method === "PUT" && write.kind === "routes") return new Response("denied", { status: 400 });
    if (write.method === "DELETE") return new Promise<Response>(() => {});
    return forward();
  });
  const response = await f.request();
  expect((await response.json()).code).toBe("GATEWAY_APPLY_UNKNOWN");
  expect(f.writes.map((write) => write.method)).toEqual(["PUT", "PUT", "PUT", "DELETE"]);
  const blocked = await f.request();
  expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
});

test("an unrecognized DELETE 404 cannot certify compensation even when a read would appear restored", async () => {
  const f = fixture();
  f.intercept(async (write, forward) => {
    if (write.kind === "routes" && write.method === "PUT") return new Response("denied", { status: 400 });
    if (write.kind === "routes" && write.method === "DELETE")
      return Response.json({ message: "Unknown endpoint" }, { status: 404 });
    return forward();
  });
  const response = await f.request();
  expect((await response.json()).code).toBe("GATEWAY_ROLLBACK_FAILED");
  const blocked = await f.request();
  expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
});

test.each(["empty", "null", "object", "wrong-key", "wrong-identity", "missing-value", "accepted"])(
  "a %s 2xx PUT acknowledgement cannot certify publication",
  async (mode) => {
    const f = fixture();
    let supplied = false;
    f.intercept(async (write, forward) => {
      const response = forward();
      if (!supplied && write.method === "PUT") {
        supplied = true;
        if (mode === "empty") return new Response("");
        if (mode === "null") return Response.json(null);
        if (mode === "object") return Response.json({});
        return Response.json(
          {
            key: `/apisix/upstreams/${mode === "wrong-key" ? "another" : write.id}`,
            ...(mode === "missing-value" ? {} : { value: { id: mode === "wrong-identity" ? "another" : write.id } }),
          },
          { status: mode === "accepted" ? 202 : 200 },
        );
      }
      return response;
    });
    const response = await f.request();
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("GATEWAY_APPLY_UNKNOWN");
    expect(f.state.upstreams).toEqual([]);
    const blocked = await f.request();
    expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
  },
);

test.each(["incomplete", "wrong-key", "zero-deleted"])(
  "a %s 2xx DELETE acknowledgement cannot certify a rollback",
  async (mode) => {
    const f = fixture();
    f.intercept(async (write, forward) => {
      if (write.method === "PUT" && write.kind === "routes") return new Response("denied", { status: 400 });
      const response = forward();
      return write.method === "DELETE"
        ? Response.json(
            mode === "incomplete"
              ? {}
              : {
                  key: `/apisix/${write.kind}/${mode === "wrong-key" ? "another" : write.id}`,
                  deleted: mode === "zero-deleted" ? "0" : "1",
                },
          )
        : response;
    });
    const response = await f.request();
    expect((await response.json()).code).toBe("GATEWAY_APPLY_UNKNOWN");
    const blocked = await f.request();
    expect((await blocked.json()).code).toBe("GATEWAY_BLOCKED");
  },
);

test.each(["root", "node"])("a complete %s acknowledgement permits additional server metadata", async (shape) => {
  const f = fixture();
  f.intercept(async (_write, forward) => {
    const ack = await forward().json();
    return Response.json(
      shape === "node" ? { node: ack, serverExtension: { version: 1 } } : { ...ack, serverExtension: { version: 1 } },
    );
  });
  const response = await f.request();
  expect(response.status).toBe(200);
  expect((await response.json()).data.outcome).toBe("applied");
});
