import { expect, test } from "bun:test";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { stringify } from "yaml";
import { ApisixAdminClient } from "../../src/apisix-admin-client";
import { createGatewayApp } from "../../src/http/app";
import { normalizeForCompare } from "../../src/normalize";
import { createClientCredentialReader } from "../../src/repositories/client-credential.repository";
import { getResourceId, resourceDefinitions } from "../../src/resources";
import { createGatewayService } from "../../src/services/gateway/gateway.service";
import type { ManifestObject, ResourceKind } from "../../src/types";
import { withApisixFixture } from "../support/apisix.fixture";
import { createGatewayPostgresTestHarness } from "../support/postgres-test-harness";
import { certificate, privateKey } from "../support/tls.fixture";

function source(version: string) {
  return {
    service: {
      desc: version,
      plugin_configs: [{ key: "shared", plugins: { "proxy-rewrite": { uri: `/${version}` } } }],
    },
    upstreams: [{ key: "api", type: "roundrobin", nodes: { "127.0.0.1:30000": 1 }, desc: version }],
    plugin_metadata: [
      { key: "opentelemetry", collector: { address: "127.0.0.1:4318" }, resource: { service: version } },
    ],
    consumers: [{ key: "reader", desc: version, plugins: { "key-auth": { key: "${CONSUMER_KEY}" } } }],
    ssls: [
      { key: "tls", cert: "${TLS_CERT}", private_key: "${TLS_PRIVATE_KEY}", snis: [`${version}.gateway.invalid`] },
    ],
    routes: [{ key: "api", uri: `/${version}/*`, upstream: "api", plugin_config: "shared" }],
  };
}

function comparable(state: Record<ResourceKind, ManifestObject[]>) {
  return Object.fromEntries(
    resourceDefinitions.map((definition) => [
      definition.kind,
      [...state[definition.kind]]
        .sort((left, right) =>
          (getResourceId(definition, left) ?? "").localeCompare(getResourceId(definition, right) ?? ""),
        )
        .map((value) => normalizeForCompare(definition.kind, value)),
    ]),
  );
}

test("real APISIX restores seven writable pre-states after prune failure and preserves unrelated resources", async () => {
  await withApisixFixture(async (fixture) => {
    await runWithOwnedTestResources(async (lifecycle) => {
      const database = await createGatewayPostgresTestHarness();
      lifecycle.registerCleanup(() => database.close());
      await database.db.insert(clients).values({
        clientCode: "tender",
        clientName: "Tender",
        clientSecret: "client-secret",
        extAttributes: {},
        status: ClientStatus.Enable,
      });
      let rejectDelete = false;
      const journal: Array<{ method: string; kind: string; status: number }> = [];
      const childLists: Array<{ status: number; fields: string[]; errorCode: unknown; missingKey: boolean }> = [];
      const remote = new ApisixAdminClient({
        adminUrl: fixture.adminUrl,
        adminKey: fixture.adminKey,
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const kind = url.pathname.split("/").at(-2) ?? "";
          if (
            rejectDelete &&
            init?.method === "DELETE" &&
            kind === "upstreams" &&
            url.pathname.endsWith("tender.api.test")
          ) {
            rejectDelete = false;
            journal.push({ method: "DELETE", kind, status: 400 });
            return new Response("controlled rejection", { status: 400 });
          }
          const response = await fetch(input, init);
          if (init?.method === "GET" && url.pathname.endsWith("/credentials")) {
            const detail = await response.clone().json();
            childLists.push({
              status: response.status,
              fields: Object.keys(detail),
              errorCode: detail.error_code,
              missingKey: JSON.stringify(detail).includes("Key not found"),
            });
          }
          if (init?.method !== "GET") journal.push({ method: init?.method ?? "GET", kind, status: response.status });
          return response;
        },
      });
      const service = createGatewayService({
        credentials: createClientCredentialReader(database.db),
        remote,
        writer: remote,
      });
      const app = createGatewayApp({ service });
      const variables = { TLS_CERT: certificate, TLS_PRIVATE_KEY: privateKey, CONSUMER_KEY: "consumer-test-key" };
      const request = (yaml: string, prune = false) =>
        app.request("/apply", {
          method: "POST",
          headers: { "content-type": "application/json", apikey: "client-secret" },
          body: JSON.stringify({ scope: "test:tender", yaml, variables, prune }),
        });
      const initial = source("first");
      const published = await request(stringify(initial));
      const publishedBody = await published.json();
      expect(published.status, JSON.stringify({ code: publishedBody.code, journal })).toBe(200);
      await remote.upsert("consumers", "prior_consumer", {
        username: "prior_consumer",
        plugins: { "key-auth": { key: "previous-consumer-key" } },
        labels: { managed_by: "shgas-iam", source: "repo-manifest", app: "tender", env: "test" },
      });
      await remote.upsert("upstreams", "unmanaged", { nodes: { "127.0.0.1:30001": 1 }, type: "roundrobin" });
      const before = await remote.read();
      journal.length = 0;
      rejectDelete = true;
      const response = await request("service: {}", true);
      const body = await response.json();
      expect(response.status, JSON.stringify({ code: body.code, journal })).toBe(502);
      expect(body.data, JSON.stringify({ code: body.code, childLists })).toMatchObject({ outcome: "rolled_back" });
      const after = await remote.read();
      expect(comparable(after)).toEqual(comparable(before));
      const restored = new Set(journal.filter((item) => item.method === "PUT").map((item) => item.kind));
      expect(restored).toEqual(new Set(resourceDefinitions.map((definition) => definition.kind)));
      expect(journal.every((item) => item.status < 300 || item.status === 400)).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/BEGIN|consumer-key|client-secret/);
    });
  });
}, 180_000);

test("real APISIX removes newly created targets after a rejected route write", async () => {
  await withApisixFixture(async (fixture) => {
    let failRoute = true;
    const remote = new ApisixAdminClient({
      adminUrl: fixture.adminUrl,
      adminKey: fixture.adminKey,
      fetch: async (input, init) => {
        if (failRoute && init?.method === "PUT" && new URL(String(input)).pathname.includes("/routes/")) {
          failRoute = false;
          return new Response("controlled rejection", { status: 400 });
        }
        return fetch(input, init);
      },
    });
    const app = createGatewayApp({
      service: createGatewayService({
        credentials: {
          readByClientCode: async () => ({
            clientSecret: "client-secret",
            status: ClientStatus.Enable,
            isDelete: false,
          }),
        },
        remote,
        writer: remote,
      }),
    });
    await remote.upsert("upstreams", "unmanaged", { nodes: { "127.0.0.1:30001": 1 }, type: "roundrobin" });
    const before = await remote.read();
    const desired = source("new");
    const response = await app.request("/apply", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "client-secret" },
      body: JSON.stringify({
        scope: "test:tender",
        yaml: stringify(desired),
        variables: { TLS_CERT: certificate, TLS_PRIVATE_KEY: privateKey, CONSUMER_KEY: "consumer-test-key" },
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.data.outcome).toBe("rolled_back");
    const after = await remote.read();
    expect(comparable(after)).toEqual(comparable(before));
  });
}, 180_000);
