import { expect, test } from "bun:test";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { ApisixAdminClient, loadRemoteState } from "../../src/apisix-admin-client";
import { createGatewayComposition } from "../../src/composition";
import { parseGatewayEnv } from "../../src/env";
import { createGatewayApp } from "../../src/http/app";
import { resourceDefinitions } from "../../src/resources";
import { createGatewayService } from "../../src/services/gateway/gateway.service";
import { withApisixFixture } from "../support/apisix.fixture";
import { createGatewayPostgresTestHarness } from "../support/postgres-test-harness";
import { certificate, privateKey } from "../support/tls.fixture";

test("authenticated HTTP preview reads seven real APISIX resource kinds and leaves their values intact", async () => {
  await withApisixFixture(async (fixture) => {
    const database = await createGatewayPostgresTestHarness();
    const composition = createGatewayComposition(
      parseGatewayEnv({
        IAM_GATEWAY_DATABASE_URL: database.databaseUrl,
        IAM_GATEWAY_APISIX_ADMIN_URL: fixture.adminUrl,
        IAM_GATEWAY_APISIX_ADMIN_KEY: fixture.adminKey,
      }),
    );
    const client = new ApisixAdminClient({ adminUrl: fixture.adminUrl, adminKey: fixture.adminKey });
    await runWithOwnedTestResources(async (lifecycle) => {
      lifecycle.registerCleanup(() => database.close());
      lifecycle.registerCleanup(() => composition.close());
      await database.db.insert(clients).values({
        clientCode: "tender",
        clientName: "Tender",
        clientSecret: "integration-client-key",
        extAttributes: {},
        status: ClientStatus.Enable,
      });
      await client.upsert("upstreams", "tender.api.test", {
        id: "tender.api.test",
        type: "roundrobin",
        nodes: { "127.0.0.1:30000": 1 },
      });
      await client.upsert("plugin_metadata", "opentelemetry", { collector: { address: "127.0.0.1:4318" } });
      await client.upsert("plugin_configs", "fixture-plugins", { plugins: { "proxy-rewrite": { uri: "/fixture" } } });
      await client.upsert("services", "tender.test", {
        id: "tender.test",
        name: "tender.test",
        labels: { managed_by: "shgas-iam", source: "repo-manifest", env: "test", app: "tender" },
      });
      await client.upsert("consumers", "fixture-consumer", {
        username: "fixture-consumer",
        plugins: { "key-auth": { key: "consumer-test-key" } },
      });
      await client.upsert("ssls", "fixture-tls", {
        cert: certificate,
        key: privateKey,
        snis: ["gateway.integration.invalid"],
      });
      await client.upsert("routes", "fixture-route", {
        uri: "/fixture",
        upstream_id: "tender.api.test",
        plugin_config_id: "fixture-plugins",
        service_id: "tender.test",
      });
      const before = await loadRemoteState(client);
      for (const definition of resourceDefinitions) expect(before[definition.kind].length).toBeGreaterThan(0);
      const request = (endpoint: string, options = {}) =>
        composition.app.request(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: "integration-client-key" },
          body: JSON.stringify({ scope: "test:tender", yaml: "service: {}", ...options }),
        });
      const diff = await request("/diff");
      const diffBody = await diff.json();
      expect(diff.status).toBe(200);
      expect(diffBody.data.plan.creates).toEqual([]);
      expect(diffBody.data.plan.updates).toEqual([]);
      expect(new Set(diffBody.data.plan.ignored.map((item: { kind: string }) => item.kind))).toEqual(
        new Set(["upstreams", "plugin_metadata", "plugin_configs", "consumers", "ssls", "routes"]),
      );
      const dryRun = await request("/apply", { dryRun: true, prune: true });
      const preview = await dryRun.json();
      expect(dryRun.status).toBe(200);
      expect(preview.data).toMatchObject({ outcome: "preview", dryRun: true, prune: true, plan: diffBody.data.plan });
      expect(JSON.stringify(preview)).not.toMatch(
        /consumer-test-key|integration-client-key|BEGIN|collector|127\.0\.0\.1/,
      );
      const after = await loadRemoteState(client);
      expect(after).toEqual(before);
    });
  });
}, 180_000);

test("HTTP diff includes every real APISIX upstream across list pages", async () => {
  await withApisixFixture(async (fixture) => {
    const pages: string[] = [];
    const observations: Array<{ page: string; total: unknown; count: number }> = [];
    const client = new ApisixAdminClient({
      adminUrl: fixture.adminUrl,
      adminKey: fixture.adminKey,
      pageSize: 10,
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (init?.method === "GET" && url.pathname.endsWith("/upstreams")) pages.push(url.search);
        const response = await fetch(input, init);
        if (init?.method === "GET") {
          const body = await response.clone().json();
          observations.push({ page: url.pathname + url.search, total: body.total, count: body.list?.length });
        }
        return response;
      },
    });
    for (let index = 0; index < 11; index++)
      await client.upsert("upstreams", `fixture-${index}`, { nodes: { "127.0.0.1:30000": 1 }, type: "roundrobin" });
    const app = createGatewayApp({
      service: createGatewayService({
        credentials: {
          async readByClientCode() {
            return { clientSecret: "test-key", status: ClientStatus.Enable, isDelete: false };
          },
        },
        remote: client,
      }),
    });
    const response = await app.request("/diff", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "test-key" },
      body: JSON.stringify({ scope: "test:tender", yaml: "service: {}" }),
    });
    const body = await response.json();
    expect(response.status, JSON.stringify(observations)).toBe(200);
    expect(new Set(body.data.plan.ignored.map((item: { id: string }) => item.id))).toEqual(
      new Set(Array.from({ length: 11 }, (_, index) => `fixture-${index}`)),
    );
    expect(pages).toEqual(["?page=1&page_size=10", "?page=2&page_size=10"]);
  });
}, 180_000);
