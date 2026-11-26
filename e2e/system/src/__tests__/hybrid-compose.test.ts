import { describe, expect, test } from "bun:test";
import { createHybridCompose, selectHybridLifecycle } from "../hybrid-compose.ts";

const ports = { postgres: 52001, redis: 52002, etcd: 52003, http: 52004, https: 52005, admin: 52006 };

describe("hybrid middleware topology", () => {
  test.each(["win32", "darwin", "freebsd"] as const)("rejects %s even with an AFK host probe", (platform) => {
    expect(() => selectHybridLifecycle({ platform, env: { IAM_AFK_HOST_PROBE_URL: "probe" } })).toThrow(/Linux.*WSL2/u);
  });

  test("rejects a direct Compose request on a non-Linux host", () => {
    const platform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      expect(() => createHybridCompose({ project: "iam-e2e-test", ports })).toThrow(/Linux.*WSL2/u);
    } finally {
      Object.defineProperty(process, "platform", { value: platform });
    }
  });

  test("selects the lifecycle for local, CI and AFK runs", () => {
    expect(selectHybridLifecycle({ platform: "linux", env: {} })).toBe("resident");
    expect(selectHybridLifecycle({ platform: "linux", env: { CI: "true" } })).toBe("fresh");
    expect(selectHybridLifecycle({ platform: "linux", env: { IAM_AFK_HOST_PROBE_URL: "probe" } })).toBe("fresh");
    expect(selectHybridLifecycle({ platform: "linux", fresh: true, env: {} })).toBe("fresh");
    expect(
      selectHybridLifecycle({ platform: "linux", lifecycle: "resident", env: { IAM_AFK_HOST_PROBE_URL: "probe" } }),
    ).toBe("resident");
  });

  test("publishes middleware ports only on loopback and bounds temporary PostgreSQL storage", () => {
    const topology = createHybridCompose({ project: "iam-e2e-test", ports });
    expect(Object.keys(topology.services)).toEqual(["postgres", "redis", "apisix-etcd", "apisix"]);
    expect(topology.services.apisix.build.context).toBe("e2e/system/docker/apisix");
    expect(topology.services.postgres.ports).toEqual(["127.0.0.1:52001:5432"]);
    expect(topology.services.redis.ports).toEqual(["127.0.0.1:52002:6379"]);
    expect(topology.services["apisix-etcd"]).toMatchObject({
      entrypoint: ["etcd"],
      ports: ["127.0.0.1:52003:2379"],
      healthcheck: { interval: "1s" },
      volumes: ["etcd-data:/bitnami/etcd"],
    });
    expect(topology.services.postgres).toMatchObject({
      tmpfs: ["/var/lib/postgresql:size=1g"],
      command: expect.arrayContaining(["fsync=off", "synchronous_commit=off", "full_page_writes=off"]),
    });
    expect(topology.volumes).not.toHaveProperty("postgres-data");
    expect(topology.services.redis.volumes).toEqual(["redis-data:/data"]);
  });

  test("passes dynamic listener and etcd settings into APISIX host mode", () => {
    const gateway = createHybridCompose({ project: "iam-e2e-test", ports }).services.apisix;
    expect("ports" in gateway).toBe(false);
    expect(gateway).toMatchObject({ network_mode: "host" });
    expect(gateway.environment).toMatchObject({
      IAM_E2E_APISIX_LISTEN_IP: "127.0.0.1",
      IAM_E2E_APISIX_HTTP_PORT: "52004",
      IAM_E2E_APISIX_HTTPS_PORT: "52005",
      IAM_E2E_APISIX_ADMIN_PORT: "52006",
      IAM_E2E_APISIX_ETCD_URL: "http://127.0.0.1:52003",
    });
  });
});
