import type { Context } from "hono";
import { ClientStatus } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const clientService = {
  createClient: mock(),
  deleteClient: mock(),
  getClientDetailByCode: mock(),
  searchClientsForAdmin: mock(),
  updateClient: mock(),
  updateClientById: mock(),
  updateClientStatus: mock(),
};

mock.module("@admin-api/services/client/client.service", () => clientService);

const handlers = await import("../client.adapter");

beforeEach(() => {
  clientService.createClient.mockReset();
  clientService.deleteClient.mockReset();
  clientService.getClientDetailByCode.mockReset();
  clientService.searchClientsForAdmin.mockReset();
  clientService.updateClient.mockReset();
  clientService.updateClientById.mockReset();
  clientService.updateClientStatus.mockReset();
});

function createContext(valid: Record<string, unknown>) {
  return {
    get: mock((key: string) => {
      if (key === "userId")
        return 1001;
      if (key === "username")
        return "admin";
      if (key === "requestId")
        return "req-1";
      return undefined;
    }),
    req: {
      valid: mock((target: string) => valid[target]),
      header: mock(() => undefined),
      path: "/admin/client",
      method: "POST",
    },
    json: mock((body: unknown) => body),
  } as unknown as Context & {
    get: ReturnType<typeof mock>;
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

describe("admin client adapter", () => {
  test("delegates search input to client service", async () => {
    const query = {
      conditions: {
        fuzzyConditions: { text: "portal" },
        exactConditions: { statuses: [ClientStatus.Enable] },
      },
      pageNum: 1,
      pageSize: 10,
    };
    clientService.searchClientsForAdmin.mockResolvedValue({ result: [], total: 0, pageNum: 1, pageSize: 10, pages: 0 });

    const context = createContext({ json: query });
    await expect(handlers.clientsSearch(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.searchClientsForAdmin).toHaveBeenCalledWith(query);
    expect(context.json).toHaveBeenCalledWith({
      code: 200,
      data: { result: [], total: 0, pageNum: 1, pageSize: 10, pages: 0 },
      message: "success",
    }, 200);
  });

  test("delegates update status input to client service", async () => {
    clientService.updateClientStatus.mockResolvedValue(true);

    const context = createContext({
      json: { status: ClientStatus.Disable },
      param: { clientCode: "portal" },
    });
    await expect(handlers.clientStatusUpdate(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.updateClientStatus).toHaveBeenCalledWith(
      "portal",
      ClientStatus.Disable,
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });

  test("delegates delete input to client service", async () => {
    clientService.deleteClient.mockResolvedValue(true);

    const context = createContext({ param: { clientCode: "portal" } });
    await expect(handlers.clientDelete(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.deleteClient).toHaveBeenCalledWith(
      "portal",
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });
});
