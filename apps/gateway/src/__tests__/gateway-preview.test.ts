import { expect, test } from "bun:test";
import { ClientStatus } from "@iam/contracts";
import { ApisixAdminClient } from "../apisix-admin-client";
import { createGatewayApp } from "../http/app";
import { createGatewayService } from "../services/gateway/gateway.service";
import type { FetchLike } from "../types";

const yaml =
  "service: {}\nupstreams:\n  - key: api\n    nodes: { 'api:30000': 1 }\nroutes:\n  - key: api\n    uri: /api/*\n    upstream: api\n";
const key = "internal-test-secret";

function createApp(
  fetch: FetchLike,
  options: { requestTimeoutMs?: number; operationTimeoutMs?: number; pageSize?: number } = {},
) {
  return createGatewayApp({
    service: createGatewayService({
      credentials: {
        async readByClientCode(code) {
          return code === "tender" ? { clientSecret: key, status: ClientStatus.Enable, isDelete: false } : null;
        },
      },
      operationTimeoutMs: options.operationTimeoutMs,
      remote: new ApisixAdminClient({
        adminUrl: "http://apisix.invalid/apisix/admin",
        adminKey: "admin-secret",
        fetch,
        ...options,
      }),
    }),
  });
}

function request(app: ReturnType<typeof createApp>, endpoint: string, extra = {}, secret: string | undefined = key) {
  return app.request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { apikey: secret } : {}) },
    body: JSON.stringify({ scope: "test:tender", yaml, ...extra }),
  });
}

test("authenticated diff previews all resource kinds without writing or exposing payloads", async () => {
  const methods: string[] = [];
  const paths: string[] = [];
  const app = createApp(async (url, init) => {
    methods.push(init?.method ?? "GET");
    const path = new URL(String(url)).pathname.split("/").at(-1)!;
    paths.push(path);
    const values =
      path === "routes"
        ? [
            {
              id: "tender.api.test",
              uri: "/old/*",
              labels: { managed_by: "shgas-iam", source: "repo-manifest", env: "test", app: "tender" },
              plugins: { "key-auth": { key: "remote-secret" } },
            },
            {
              id: "tender.removed.test",
              labels: { managed_by: "shgas-iam", source: "repo-manifest", env: "test", app: "tender" },
            },
            { id: "manual", plugins: { secret: "unmanaged-secret" } },
          ]
        : [];
    return Response.json({
      list: values.map((value) => ({ key: `/apisix/${path}/${value.id}`, value })),
      total: values.length,
    });
  });
  const response = await request(app, "/diff");
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data).toEqual({
    outcome: "preview",
    plan: {
      creates: [
        { kind: "upstreams", id: "tender.api.test" },
        { kind: "services", id: "tender.test" },
      ],
      updates: [{ kind: "routes", id: "tender.api.test" }],
      deletes: [{ kind: "routes", id: "tender.removed.test" }],
      ignored: [{ kind: "routes", id: "manual", reason: "unmanaged" }],
    },
  });
  expect(paths).toEqual(["upstreams", "plugin_metadata", "plugin_configs", "services", "consumers", "ssls", "routes"]);
  expect(new Set(methods)).toEqual(new Set(["GET"]));
});

test.each(["/diff", "/apply"])("%s authenticates and validates before any remote access", async (endpoint) => {
  let reads = 0;
  const app = createApp(async () => {
    reads++;
    return Response.json({ list: [], total: 0 });
  });
  for (const secret of ["", "wrong"]) {
    const response = await request(app, endpoint, endpoint === "/apply" ? { dryRun: true } : {}, secret);
    expect(response.status).toBe(401);
  }
  const wrongScope = await request(app, endpoint, {
    scope: "test:other",
    ...(endpoint === "/apply" ? { dryRun: true } : {}),
  });
  expect(wrongScope.status).toBe(401);
  const badInput = await request(app, endpoint, {
    yaml: "service: [",
    ...(endpoint === "/apply" ? { dryRun: true } : {}),
  });
  expect(badInput.status).toBe(400);
  expect(reads).toBe(0);
});

test.each(["complete", "unpaginated complete", "duplicate", "changed total", "missing page"])(
  "pagination handles %s inventories without losing resources",
  async (mode) => {
    const pages: number[] = [];
    const app = createApp(
      async (url) => {
        const parsed = new URL(String(url));
        if (!parsed.pathname.endsWith("/upstreams")) return Response.json({ list: [], total: 0 });
        const page = Number(parsed.searchParams.get("page"));
        pages.push(page);
        const ids =
          page === 1
            ? Array.from({ length: mode === "unpaginated complete" ? 11 : 10 }, (_, index) => `u${index}`)
            : mode === "missing page"
              ? []
              : [mode === "duplicate" ? "u0" : "u10"];
        return Response.json({
          total: mode === "changed total" && page === 2 ? 12 : 11,
          list: ids.map((id) => ({ key: `/apisix/upstreams/${id}`, value: { id } })),
        });
      },
      { pageSize: 10 },
    );
    const response = await request(app, "/diff");
    const body = await response.json();
    expect(pages).toEqual(mode === "unpaginated complete" ? [1] : [1, 2]);
    if (mode === "complete" || mode === "unpaginated complete") {
      expect(response.status).toBe(200);
      expect(body.data.plan.ignored.map((item: { id: string }) => item.id)).toEqual(
        Array.from({ length: 11 }, (_, index) => `u${index}`),
      );
    } else {
      expect(response.status).toBe(502);
      expect(body.code).toBe("GATEWAY_REMOTE_INVALID");
    }
  },
);

test.each(["http", "json", "body", "network"])(
  "remote %s failures cannot leak response or connection secrets",
  async (mode) => {
    const app = createApp(async () => {
      if (mode === "network") throw new Error("admin-secret @ http://secret-connection");
      if (mode === "http") return new Response("admin-secret remote-private-payload", { status: 403 });
      if (mode === "body")
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("private-body"));
            },
          }),
        );
      return new Response("private-json");
    });
    const response = await request(app, "/diff");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "GATEWAY_REMOTE_UNAVAILABLE",
      message: "APISIX resource reading failed",
      data: null,
    });
  },
);

test.each([
  { requestTimeoutMs: 15, operationTimeoutMs: 100 },
  { requestTimeoutMs: 100, operationTimeoutMs: 15 },
])("read budgets bound an unresponsive adapter and release apply ownership: %j", async (options) => {
  let stalled = true;
  const app = createApp(
    async () => (stalled ? new Promise<Response>(() => {}) : Response.json({ list: [], total: 0 })),
    options,
  );
  const failed = await request(app, "/apply", { dryRun: true });
  expect(failed.status).toBe(503);
  stalled = false;
  const next = await request(app, "/apply", { dryRun: true });
  expect(next.status).toBe(200);
});

test.each([
  ["unknown envelope", {}],
  ["absent total", { list: [] }],
  ["invalid total", { list: [], total: -1 }],
  ["missing item", { list: [], total: 1 }],
  ["invalid item", { list: [null], total: 1 }],
  ["invalid value", { list: [{ key: "/apisix/upstreams/u", value: "remote-secret" }], total: 1 }],
  ["mismatched identity", { list: [{ key: "/apisix/upstreams/u", value: { id: "different" } }], total: 1 }],
])("diff rejects %s rather than planning against an empty remote", async (_name, envelope) => {
  const methods: string[] = [];
  const app = createApp(async (_url, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json(envelope);
  });
  const response = await request(app, "/diff");
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body).toEqual({
    code: "GATEWAY_REMOTE_INVALID",
    message: "APISIX returned an invalid or incomplete resource list",
    data: null,
  });
  expect(methods).toEqual(["GET"]);
});

test("dry-run holds this instance's apply right until reading finishes and rereads on the next request", async () => {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  const methods: string[] = [];
  const app = createApp(async (_url, init) => {
    methods.push(init?.method ?? "GET");
    if (++reads === 1) {
      entered();
      await gate;
    }
    return Response.json({ list: [], total: 0 });
  });
  const first = Promise.resolve(request(app, "/apply", { dryRun: true }));
  try {
    const firstPhase = await Promise.race([
      started.then(() => ({ kind: "reading" })),
      first.then((response) => ({ kind: "completed", status: response.status })),
    ]);
    expect(firstPhase).toEqual({ kind: "reading" });
    const busy = await request(app, "/apply", { dryRun: true });
    expect(busy.status).toBe(409);
    expect((await busy.json()).code).toBe("GATEWAY_BUSY");
    expect(reads).toBe(1);
  } finally {
    release();
    await Promise.allSettled([first]);
  }
  const completed = await first;
  expect(completed.status).toBe(200);
  expect((await completed.json()).data).toMatchObject({ outcome: "preview", dryRun: true, prune: false });
  const next = await request(app, "/apply", { dryRun: true, prune: true });
  expect(next.status).toBe(200);
  expect((await next.json()).data.prune).toBe(true);
  expect(reads).toBe(14);
  expect(new Set(methods)).toEqual(new Set(["GET"]));
});

test("diff observes changes to nested plugin keys while ignoring only resource-root metadata", async () => {
  const app = createApp(async (url) => {
    const path = new URL(String(url)).pathname.split("/").at(-1)!;
    const value = {
      username: "tender_backend_test",
      create_time: 123,
      labels: {
        managed_by: "shgas-iam",
        source: "repo-manifest",
        env: "test",
        app: "tender",
      },
      plugins: { "key-auth": { key: "previous-secret" } },
    };
    return Response.json({
      list: path === "consumers" ? [{ key: "/apisix/consumers/tender_backend_test", value }] : [],
      total: path === "consumers" ? 1 : 0,
    });
  });
  const response = await request(app, "/diff", {
    yaml: "service: {}\nconsumers:\n  - key: backend\n    plugins:\n      key-auth: { key: '${KEY}' }\n",
    variables: { KEY: "new-secret" },
  });
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data.plan).toEqual({
    creates: [{ kind: "services", id: "tender.test" }],
    updates: [{ kind: "consumers", id: "tender_backend_test" }],
    deletes: [],
    ignored: [],
  });
  expect(JSON.stringify(body)).not.toMatch(/previous-secret|new-secret|admin-secret|internal-test-secret/);
});
