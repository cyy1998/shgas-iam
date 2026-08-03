import type { GenericClientRecord } from "@iam/domain/client";
import { ClientStatus } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { createClientService } from "../client.service";

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

describe("generic Client reader", () => {
  test("caches only the shared generic Client runtime DTO", async () => {
    const cache = new Map<string, string>();
    const service = createClientService({
      redis: {
        del: async key => Number(cache.delete(key)),
        get: async key => cache.get(key) ?? null,
        set: async (key, value) => {
          cache.set(key, value);
          return "OK";
        },
      },
      clientRepository: {
        getClientByCode: async () => storedClient,
        getClientBySecret: async () => storedClient,
      },
    });

    const first = await service.getClientByCode(storedClient.clientCode);
    const cached = await service.getClientByCode(storedClient.clientCode);

    expect({ first, cached }).toEqual({
      first: {
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
        extAttributes: {},
      },
      cached: {
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
        extAttributes: {},
      },
    });
  });
});
