import type { GenericClientRecord } from "@iam/domain/client";
import { createClientService } from "@api/services/client/client.service";
import { ClientStatus } from "@iam/contracts";
import { describe, expect, test } from "bun:test";

const storedClient = {
  id: 1,
  clientCode: "portal",
  clientName: "Portal",
  clientSecret: "general-secret",
  url: null,
  status: ClientStatus.Enable,
  description: null,
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00.000Z"),
  updateTime: new Date("2026-01-01T00:00:00.000Z"),
} satisfies GenericClientRecord;

function fixture() {
  const cache = new Map<string, string>();
  let sourceAvailable = true;
  const source = {
    ...storedClient,
    ssoSecret: "SSO-SECRET-SENTINEL",
    privateStorageField: "PRIVATE-STORAGE-SENTINEL",
  };
  async function readSource() {
    if (!sourceAvailable)
      throw new Error("Source is unavailable after the cold read");
    return source;
  }
  const service = createClientService({
    redis: {
      del: async key => Number(cache.delete(key)),
      get: async key => cache.get(key) ?? null,
      set: async (key, value) => {
        cache.set(key, value);
        return "OK";
      },
    },
    clientRepository: { getClientByCode: readSource, getClientBySecret: readSource },
  });
  return { service, cache, stopSource: () => {
    sourceAvailable = false;
  } };
}

describe("generic Client reader", () => {
  test.each(["code", "secret"] as const)("a cold %s lookup populates both lookup capabilities", async (lookup) => {
    const f = fixture();
    const first = lookup === "code"
      ? await f.service.getClientByCode(storedClient.clientCode)
      : await f.service.getClientBySecret(storedClient.clientSecret);
    expect(first).toEqual({ ...storedClient, extAttributes: {} });
    f.stopSource();
    const byCode = await f.service.getClientByCode(storedClient.clientCode);
    const bySecret = await f.service.getClientBySecret(storedClient.clientSecret);
    expect(byCode).toEqual(first);
    expect(bySecret).toEqual(first);
  });

  test("serializes only the generic runtime DTO into every populated cache entry", async () => {
    const f = fixture();
    await f.service.getClientByCode(storedClient.clientCode);
    expect(f.cache.size).toBeGreaterThan(0);
    const expected = JSON.parse(JSON.stringify({ ...storedClient, extAttributes: {} }));
    for (const payload of f.cache.values())
      expect(JSON.parse(payload)).toEqual(expected);
  });
});
