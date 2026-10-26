import { expect, test } from "bun:test";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { stringify } from "yaml";
import { withApisixFixture } from "../support/apisix.fixture";
import { createGatewayProcessFixture } from "../support/gateway-process.fixture";
import { createGatewayPostgresTestHarness } from "../support/postgres-test-harness";
import { certificate, privateKey } from "../support/tls.fixture";

for (const deployment of ["dev", "prod"] as const) {
  test(`independent Gateway publishes seven kinds against the synthetic ${deployment} APISIX configuration`, async () => {
    await withApisixFixture(
      async (apisix) => {
        await runWithOwnedTestResources(async (lifecycle) => {
          const database = await createGatewayPostgresTestHarness();
          lifecycle.registerCleanup(() => database.close());
          await database.db.insert(clients).values({
            clientCode: "iam",
            clientName: "IAM",
            clientSecret: "lifecycle-client-key",
            status: ClientStatus.Enable,
            extAttributes: {},
          });
          const gateway = await createGatewayProcessFixture({
            lifecycle,
            databaseUrl: database.databaseUrl,
            adminUrl: apisix.adminUrl,
            adminKey: apisix.adminKey,
          });
          lifecycle.registerCleanup(() => gateway.close());
          const source = {
            service: {
              desc: "Synthetic seven-resource publication",
              plugin_configs: [
                {
                  key: "api",
                  plugins: {
                    "request-id": { header_name: "X-Request-Id", include_in_response: true },
                    opentelemetry: { sampler: { name: "always_off" } },
                  },
                },
              ],
            },
            upstreams: [{ key: "api", nodes: { "${API_HOST}:${API_PORT}": 1 } }],
            routes: [{ key: "api", uri: "/synthetic/*", upstream: "api", plugin_config: "api" }],
            plugin_metadata: [
              {
                key: "opentelemetry",
                set_ngx_var: true,
                collector: { address: "${COLLECTOR}", request_timeout: 3 },
              },
            ],
            consumers: [{ key: "reader", plugins: { "key-auth": { key: "${CONSUMER_KEY}" } } }],
            ssls: [{ key: "tls", cert: "${TLS_CERT}", private_key: "${TLS_PRIVATE_KEY}", snis: ["gateway.invalid"] }],
          };
          const variables = {
            API_HOST: "127.0.0.1",
            API_PORT: "30000",
            COLLECTOR: "127.0.0.1:9",
            CONSUMER_KEY: "synthetic-key",
            TLS_CERT: certificate,
            TLS_PRIVATE_KEY: privateKey,
          };
          const publish = async () => {
            const response = await fetch(`${gateway.origin}/apply`, {
              method: "POST",
              headers: { "content-type": "application/json", apikey: "lifecycle-client-key" },
              body: JSON.stringify({ scope: `${deployment}:iam`, yaml: stringify(source), variables, prune: true }),
              signal: AbortSignal.timeout(20_000),
            });
            return { status: response.status, body: await response.json() };
          };
          const applied = await publish();
          expect(applied.status, JSON.stringify(applied.body)).toBe(200);
          expect(applied.body.data).toMatchObject({ outcome: "applied", written: true });
          const response = await fetch(`${apisix.adminUrl}/upstreams/iam.api.${deployment}`, {
            headers: { "X-API-KEY": apisix.adminKey },
            signal: AbortSignal.timeout(5000),
          });
          const actual = await response.json();
          expect(response.status).toBe(200);
          expect(actual.value.nodes).toEqual({ "127.0.0.1:30000": 1 });
          for (const [kind, id, expected] of [
            ["services", `iam.${deployment}`, { desc: "Synthetic seven-resource publication" }],
            ["routes", `iam.api.${deployment}`, { uri: "/synthetic/*", upstream_id: `iam.api.${deployment}` }],
            ["plugin_configs", `iam.api.${deployment}`, { plugins: { "request-id": { header_name: "X-Request-Id" } } }],
            ["plugin_metadata", "opentelemetry", { collector: { address: "127.0.0.1:9" } }],
            ["consumers", `iam_reader_${deployment}`, { username: `iam_reader_${deployment}` }],
            ["ssls", `iam.tls.${deployment}`, { snis: ["gateway.invalid"] }],
          ] as const) {
            const published = await fetch(`${apisix.adminUrl}/${kind}/${id}`, {
              headers: { "X-API-KEY": apisix.adminKey },
              signal: AbortSignal.timeout(5000),
            });
            const resource = await published.json();
            expect(published.status).toBe(200);
            expect(resource.value).toMatchObject(expected);
          }
          // APISIX encrypts SSL list keys, so remove the synthetic TLS resource before checking no-change.
          source.ssls = [];
          source.consumers = [];
          const pruned = await publish();
          expect(pruned.body.data).toMatchObject({ outcome: "applied", written: true });
          const absent = await fetch(`${apisix.adminUrl}/consumers/iam_reader_${deployment}`, {
            headers: { "X-API-KEY": apisix.adminKey },
            signal: AbortSignal.timeout(5000),
          });
          await absent.arrayBuffer();
          expect(absent.status).toBe(404);
          const unchangedManifest = await publish();
          expect(unchangedManifest.body.data).toMatchObject({ outcome: "no_change", written: false });
        });
      },
      { deployment },
    );
  }, 180_000);
}
