import { expect, test } from "bun:test";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { parse, stringify } from "yaml";
import { withApisixFixture } from "../support/apisix.fixture";
import { createGatewayProcessFixture } from "../support/gateway-process.fixture";
import { createGatewayPostgresTestHarness } from "../support/postgres-test-harness";
import { certificate, privateKey } from "../support/tls.fixture";

for (const deployment of ["dev", "prod"] as const) {
  test(`independent Gateway publishes seven kinds against the actual ${deployment} APISIX configuration`, async () => {
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
          const source = parse(await Bun.file(new URL("../../manifests/dev/iam.yaml", import.meta.url)).text());
          source.consumers = [{ key: "reader", plugins: { "key-auth": { key: "${CONSUMER_KEY}" } } }];
          source.ssls = [
            { key: "tls", cert: "${TLS_CERT}", private_key: "${TLS_PRIVATE_KEY}", snis: ["gateway.invalid"] },
          ];
          const variables = {
            APISIX_OTEL_COLLECTOR_ENDPOINT: "127.0.0.1:9",
            DEV_IAM_API_UPSTREAM_HOST: "127.0.0.1",
            DEV_IAM_API_UPSTREAM_PORT: "30000",
            DEV_IAM_ADMIN_API_UPSTREAM_HOST: "127.0.0.1",
            DEV_IAM_ADMIN_API_UPSTREAM_PORT: "30001",
            DEV_IAM_SSO_FRONTEND_UPSTREAM_HOST: "127.0.0.1",
            DEV_IAM_SSO_FRONTEND_UPSTREAM_PORT: "30002",
            DEV_IAM_ADMIN_FRONTEND_UPSTREAM_HOST: "127.0.0.1",
            DEV_IAM_ADMIN_FRONTEND_UPSTREAM_PORT: "30003",
            IAM_SSO_INTERNAL_HOST: "internal.gateway.invalid",
            IAM_SSO_EXTERNAL_HOST: "external.gateway.invalid",
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
