import { ClientStatus } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const clientService = {
  createClient: mock(),
  deleteClient: mock(),
  getClientDetailByCode: mock(),
  searchClientsForAdmin: mock(),
  updateClient: mock(),
  updateClientStatus: mock(),
};

mock.module("@admin-api/services/client/client.service", () => clientService);

const ops = await import("../client.ops");

beforeEach(() => {
  clientService.createClient.mockReset();
  clientService.deleteClient.mockReset();
  clientService.getClientDetailByCode.mockReset();
  clientService.searchClientsForAdmin.mockReset();
  clientService.updateClient.mockReset();
  clientService.updateClientStatus.mockReset();
});

describe("admin client ops", () => {
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

    await expect(ops.searchClientOp.handler(query)).resolves.toMatchObject({ total: 0 });

    expect(clientService.searchClientsForAdmin).toHaveBeenCalledWith(query);
  });

  test("delegates update status input to client service", async () => {
    clientService.updateClientStatus.mockResolvedValue(true);

    await expect(ops.updateClientStatusOp.handler({
      clientCode: "portal",
      status: ClientStatus.Disable,
    })).resolves.toBe(true);

    expect(clientService.updateClientStatus).toHaveBeenCalledWith("portal", ClientStatus.Disable);
  });

  test("delegates delete input to client service", async () => {
    clientService.deleteClient.mockResolvedValue(true);

    await expect(ops.deleteClientOp.handler({ clientCode: "portal" })).resolves.toBe(true);

    expect(clientService.deleteClient).toHaveBeenCalledWith("portal");
  });
});
