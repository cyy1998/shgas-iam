import { describe, expect, test } from "bun:test";
import { createHybridCompose, selectHybridModes } from "../hybrid-compose.ts";

const ports = { postgres: 52001, redis: 52002, etcd: 52003, http: 52004, https: 52005, admin: 52006 };

describe("hybrid middleware topology", () => {
  test("selects connectivity independently of fresh or resident lifecycle", () => {
    expect(selectHybridModes({ platform: "win32", env: {} })).toEqual({
      network: "bridge",
      lifecycle: "resident",
      upstreamHost: "host.docker.internal",
    });
    expect(
      selectHybridModes({ platform: "darwin", fresh: true, env: { IAM_E2E_UPSTREAM_HOST: "loopback.test" } }),
    ).toEqual({
      network: "bridge",
      lifecycle: "fresh",
      upstreamHost: "loopback.test",
    });
    expect(selectHybridModes({ platform: "linux", env: { CI: "true" } })).toEqual({
      network: "host",
      lifecycle: "fresh",
      upstreamHost: "127.0.0.1",
    });
    expect(
      selectHybridModes({ platform: "win32", lifecycle: "resident", env: { IAM_AFK_HOST_PROBE_URL: "probe" } }),
    ).toEqual({
      network: "host",
      lifecycle: "resident",
      upstreamHost: "127.0.0.1",
    });
  });

  test("publishes bridge listeners only on loopback and uses named data volumes", () => {
    const topology = createHybridCompose({ project: "iam-e2e-test", ports, network: "bridge" });
    expect(Object.keys(topology.services)).toEqual(["postgres", "redis", "apisix-etcd", "apisix"]);
    expect(topology.services.apisix).toMatchObject({
      build: { context: "e2e/system/docker/apisix" },
      ports: ["127.0.0.1:52004:9080", "127.0.0.1:52005:9443", "127.0.0.1:52006:9180"],
    });
    expect(topology.services["apisix-etcd"]).toMatchObject({
      entrypoint: ["etcd"],
      healthcheck: { interval: "1s" },
      volumes: ["etcd-data:/bitnami/etcd"],
    });
    expect(topology.services.postgres.volumes).toEqual(["postgres-data:/var/lib/postgresql"]);
    expect(topology.services.redis.volumes).toEqual(["redis-data:/data"]);
  });

  test("passes dynamic listener and etcd settings into APISIX host mode", () => {
    const gateway = createHybridCompose({ project: "iam-e2e-test", ports, network: "host" }).services.apisix;
    expect("ports" in gateway).toBe(false);
    expect(gateway).toMatchObject({ network_mode: "host" });
    expect(gateway.environment).toMatchObject({
      IAM_E2E_APISIX_HTTP_PORT: "52004",
      IAM_E2E_APISIX_HTTPS_PORT: "52005",
      IAM_E2E_APISIX_ADMIN_PORT: "52006",
      IAM_E2E_APISIX_ETCD_URL: "http://127.0.0.1:52003",
    });
  });
});
