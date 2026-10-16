import { connect } from "node:net";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { stringify } from "yaml";
import { ApisixAdminClient } from "../../src/apisix-admin-client";
import { withApisixFixture } from "./apisix.fixture";
import { createApisixFaultProxy } from "./apisix-fault-proxy.fixture";
import {
  createGatewayProcessFixture,
  type GatewayApplyBody,
  type GatewayProcessFixture,
} from "./gateway-process.fixture";
import { bounded } from "./lifecycle-sync.fixture";
import { createGatewayPostgresTestHarness } from "./postgres-test-harness";

function body(version: string): GatewayApplyBody {
  return {
    scope: "test:tender",
    yaml: stringify({
      service: { desc: version },
      upstreams: [{ key: "api", type: "roundrobin", nodes: { "127.0.0.1:30000": 1 }, desc: version }],
      routes: [{ key: "api", uri: `/${version}/*`, upstream: "api" }],
    }),
  };
}

async function observeAvailability(gateway: GatewayProcessFixture) {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    // Each observation is a new read-only dry-run, never a retry of the disconnected publish.
    const result = await gateway.apply({ ...body("observation"), dryRun: true });
    if (result.body.code !== "GATEWAY_BUSY") return result;
  }
  throw new Error("Gateway publishing state did not settle");
}

type LifecycleContext = {
  proxy: Awaited<ReturnType<typeof createApisixFaultProxy>>;
  remote: ApisixAdminClient;
  database: Awaited<ReturnType<typeof createGatewayPostgresTestHarness>>;
  startGateway(options?: { operationTimeoutMs?: number; requestTimeoutMs?: number }): Promise<GatewayProcessFixture>;
  connectCaller(
    gateway: GatewayProcessFixture,
    input: GatewayApplyBody,
  ): Promise<{ disconnect(): Promise<void>; receivedBytes(): number }>;
  body: typeof body;
  observeAvailability: typeof observeAvailability;
};

export async function withGatewayLifecycleFixture<T>(exercise: (context: LifecycleContext) => Promise<T>) {
  return withApisixFixture((apisix) =>
    runWithOwnedTestResources(async (lifecycle) => {
      const database = await createGatewayPostgresTestHarness();
      lifecycle.registerCleanup(() => database.close());
      await database.db.insert(clients).values({
        clientCode: "tender",
        clientName: "Lifecycle",
        clientSecret: "lifecycle-client-key",
        extAttributes: {},
        status: ClientStatus.Enable,
      });
      const proxy = await createApisixFaultProxy(apisix);
      lifecycle.registerCleanup(() => proxy.close());
      const remote = new ApisixAdminClient({ adminUrl: apisix.adminUrl, adminKey: apisix.adminKey });
      try {
        return await exercise({
          proxy,
          remote,
          database,
          body,
          observeAvailability,
          async startGateway(options = {}) {
            const gateway = await createGatewayProcessFixture({
              lifecycle,
              databaseUrl: database.databaseUrl,
              adminUrl: proxy.adminUrl,
              adminKey: apisix.adminKey,
              ...options,
            });
            lifecycle.registerCleanup(() => gateway.close());
            return gateway;
          },
          async connectCaller(gateway, input) {
            const socket = connect(gateway.port, "127.0.0.1");
            let bytes = 0;
            socket.on("data", (chunk) => {
              bytes += Buffer.byteLength(chunk);
            });
            socket.on("error", () => {});
            const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
            const disconnect = async () => {
              socket.destroy();
              await bounded(closed, "disconnected caller close");
            };
            lifecycle.registerCleanup(disconnect);
            await bounded(
              new Promise<void>((resolve, reject) => {
                socket.once("connect", resolve);
                socket.once("error", reject);
              }),
              "caller TCP connect",
            );
            const payload = JSON.stringify(input);
            socket.write(
              `POST /apply HTTP/1.1\r\nHost: 127.0.0.1:${gateway.port}\r\nContent-Type: application/json\r\napikey: lifecycle-client-key\r\nContent-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`,
            );
            return { disconnect, receivedBytes: () => bytes };
          },
        });
      } finally {
        proxy.releaseAll();
      }
    }),
  );
}
