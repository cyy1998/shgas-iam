import { describe, expect, it } from "bun:test";
import Redis from "ioredis";
import {
  createProcessSmokeRedisServer,
  seedProcessSmokeClientBinding,
  seedProcessSmokeCredential,
} from "../../src/testing/process-smoke-redis-server";

describe("process smoke Redis server", () => {
  it("serves seeded values, empty repair claims, and subscriptions to real ioredis clients", async () => {
    const server = await createProcessSmokeRedisServer({
      subjectAccessRepairBacklogMetrics: {
        count: 2,
        oldestAgeMs: 75,
      },
      values: new Map([["seeded-key", "seeded-value"]]),
    });
    const client = new Redis({
      host: server.hostname,
      port: server.port,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
    });
    const subscriber = client.duplicate();

    try {
      expect(await client.get("seeded-key")).toBe("seeded-value");
      expect(await client.get("missing-key")).toBeNull();
      await client.set("consumable-key", "consumable-value");
      expect(await client.getdel("consumable-key")).toBe("consumable-value");
      expect(await client.getdel("consumable-key")).toBeNull();
      expect(await client.zadd("owned-zset", 20, "second")).toBe(1);
      expect(await client.zadd("owned-zset", 10, "first")).toBe(1);
      expect(await client.zrange("owned-zset", 0, -1)).toEqual([
        "first",
        "second",
      ]);
      expect(await client.eval("return {}", 0)).toEqual([]);
      expect(await client.eval(
        "-- subject-access:inspect-repair-backlog\nreturn {}",
        2,
        "subject-access:v1:idx:repair",
        "subject-access:v1:idx:repair:age",
      )).toEqual(["2", "75"]);
      expect(await client.eval(
        "-- custom-sso-client-runtime:read\nreturn {}",
        3,
        "custom-sso:cache",
        "custom-sso:mutation",
        "custom-sso:generation",
      )).toEqual(["ready", "0"]);
      expect(await client.eval(
        "-- custom-sso-client-runtime:publish\nreturn 1",
        3,
        "custom-sso:cache",
        "custom-sso:mutation",
        "custom-sso:generation",
        "0",
        "cached-runtime",
        "30000",
      )).toBe(1);
      expect(await client.eval(
        "-- custom-sso-client-runtime:read\nreturn {}",
        3,
        "custom-sso:cache",
        "custom-sso:mutation",
        "custom-sso:generation",
      )).toEqual(["ready", "0", "cached-runtime"]);
      expect(await client.multi()
        .incr("custom-sso:generation")
        .del("seeded-key")
        .exec()).toEqual([
        [null, 1],
        [null, 1],
      ]);
      expect(await client.get("custom-sso:generation")).toBe("1");
      expect(await client.get("seeded-key")).toBeNull();
      expect(await subscriber.subscribe("subject-access-smoke")).toBe(1);

      expect(server.commands.map(command => command.name)).toEqual(
        expect.arrayContaining(["get", "eval", "multi", "incr", "del", "exec", "subscribe"]),
      );
    }
    finally {
      client.disconnect();
      subscriber.disconnect();
      await server.close();
    }
  });

  it("seeds Gateway binding and credential metadata for production composition smoke tests", async () => {
    const server = await createProcessSmokeRedisServer();
    const client = new Redis({
      host: server.hostname,
      port: server.port,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
    });
    const common = {
      lookupHmacId: "smoke",
      lookupHmacSecret: "process-smoke-secret-that-is-at-least-32-bytes",
      namespace: "sess:process-smoke:",
      principalSessionId: "principal-session-smoke",
      subjectAccessTransitionId: "10000000-0000-4000-8000-000000000001",
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
    };
    const metadata = {
      version: 1,
      mode: "gateway",
      configVersion: 7,
    };

    try {
      const binding = seedProcessSmokeClientBinding(server, {
        ...common,
        bindingId: "gateway-binding-smoke",
        clientCode: "gateway-smoke",
        metadata,
        protocol: "custom-sso",
        renewalPolicy: "extend_with_principal",
      });
      const credential = seedProcessSmokeCredential(server, {
        ...common,
        bindingId: binding.bindingId,
        clientCode: binding.clientCode,
        credentialId: "gateway-credential-smoke",
        credentialType: "local_session",
        externalToken: `iam_ls_${"b".repeat(43)}`,
        metadata,
        protocol: "custom-sso",
        renewalPolicy: "extend_with_principal",
      });

      expect(binding).toMatchObject({
        bindingId: "gateway-binding-smoke",
        metadata,
        renewalPolicy: "extend_with_principal",
      });
      expect(credential).toMatchObject({
        bindingId: "gateway-binding-smoke",
        metadata,
        renewalPolicy: "extend_with_principal",
      });
      await expect(client.get(
        "sess:process-smoke:active:b:gateway-binding-smoke",
      )).resolves.toBe(JSON.stringify(binding));
      await expect(client.get(
        "sess:process-smoke:active:c:gateway-credential-smoke",
      )).resolves.toBe(JSON.stringify(credential));
    }
    finally {
      await client.quit();
      await server.close();
    }
  });
});
