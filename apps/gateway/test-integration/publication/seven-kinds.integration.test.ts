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

test("formal authenticated publication writes all seven resource kinds to real APISIX", async () => {
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
      const observations: Array<{ method: string; kind: string; status: number; usernamePattern?: boolean }> = [];
      const remote = new ApisixAdminClient({
        adminUrl: fixture.adminUrl,
        adminKey: fixture.adminKey,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (init?.method !== "GET") {
            const detail = response.ok ? "" : await response.clone().text();
            observations.push({
              method: init?.method ?? "GET",
              kind: new URL(String(input)).pathname.split("/").at(-2) ?? "unknown",
              status: response.status,
              ...(detail ? { usernamePattern: detail.includes("username") && detail.includes("pattern") } : {}),
            });
          }
          return response;
        },
      });
      const service = createGatewayService({
        credentials: createClientCredentialReader(database.db),
        remote,
        writer: remote,
      });
      const app = createGatewayApp({ service });
      const input = {
        scope: "test:tender",
        yaml: stringify(source("first")),
        variables: { TLS_CERT: certificate, TLS_PRIVATE_KEY: privateKey, CONSUMER_KEY: "consumer-test-key" },
      };
      const response = await app.request("/apply", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "client-secret" },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      expect(response.status, JSON.stringify({ code: body.code, observations })).toBe(200);
      expect(body.data).toMatchObject({ outcome: "applied", written: true });
      const actual = await remote.read();
      for (const definition of resourceDefinitions) expect(actual[definition.kind]).toHaveLength(1);
      expect(actual.ssls[0]?.key).toBeDefined();
      expect(JSON.stringify(body)).not.toMatch(/BEGIN|consumer-test-key|client-secret|collector/);
      const credentialUrl = `${fixture.adminUrl}/consumers/tender_reader_test/credentials/child`;
      const childWrite = await fetch(credentialUrl, {
        method: "PUT",
        headers: { "X-API-KEY": fixture.adminKey, "content-type": "application/json" },
        body: JSON.stringify({ plugins: { "key-auth": { key: "child-consumer-key" } } }),
      });
      await childWrite.arrayBuffer();
      expect(childWrite.status).toBe(201);
      const readChild = async () => {
        const response = await fetch(credentialUrl, { headers: { "X-API-KEY": fixture.adminKey } });
        expect(response.status).toBe(200);
        return response.json();
      };
      const beforeChild = await readChild();
      const changed = source("first");
      changed.consumers[0]!.desc = "updated";
      const updated = await app.request("/apply", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "client-secret" },
        body: JSON.stringify({ ...input, yaml: stringify(changed) }),
      });
      expect(updated.status).toBe(200);
      const afterPutChild = await readChild();
      expect(afterPutChild).toEqual(beforeChild);
      const writesBeforePrune = observations.length;
      const prune = await app.request("/apply", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "client-secret" },
        body: JSON.stringify({ ...input, yaml: "service: {}", prune: true }),
      });
      const pruneBody = await prune.json();
      expect(prune.status).toBe(502);
      expect(pruneBody.code).toBe("GATEWAY_SNAPSHOT_INVALID");
      expect(observations).toHaveLength(writesBeforePrune);
      const afterRejectedChild = await readChild();
      expect(afterRejectedChild).toEqual(beforeChild);
      const removed = await fetch(credentialUrl, { method: "DELETE", headers: { "X-API-KEY": fixture.adminKey } });
      await removed.arrayBuffer();
      expect(removed.status).toBe(200);
      const next = await app.request("/apply", {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "client-secret" },
        body: JSON.stringify({ ...input, yaml: "service: {}", prune: true }),
      });
      expect(next.status).toBe(200);
    });
  });
}, 180_000);
