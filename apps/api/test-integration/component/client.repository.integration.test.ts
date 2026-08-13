import type { GenericClientRecord } from "@iam/domain/client";
import { createClientRepository } from "@api/services/client/client.repository";
import { ClientStatus } from "@iam/contracts";
import { expect, test } from "bun:test";

const genericClientRecord = {
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

function createSelectDb(row: GenericClientRecord) {
  const selections: string[][] = [];
  return {
    db: {
      select(selection: Record<string, unknown>) {
        const selectedColumns = Object.keys(selection);
        selections.push(selectedColumns);
        return {
          from() {
            return {
              where() {
                return {
                  limit: async () => [Object.fromEntries(
                    selectedColumns.map(column => [
                      column,
                      row[column as keyof GenericClientRecord],
                    ]),
                  )],
                };
              },
            };
          },
        };
      },
    },
    selections,
  };
}

test("generic Client provider reads only the protocol-neutral projection", async () => {
  const fake = createSelectDb(genericClientRecord);
  const repository = createClientRepository(fake.db as never);

  await expect(repository.findClientTrafficState("portal")).resolves.toEqual({
    clientCode: "portal",
    isDelete: false,
    status: ClientStatus.Enable,
  });
  await expect(repository.getClientByCode("portal")).resolves.toEqual(genericClientRecord);
  await expect(repository.getClientBySecret("general-secret")).resolves.toEqual(genericClientRecord);
  expect(fake.selections).toEqual([
    [
      "clientCode",
      "isDelete",
      "status",
    ],
    [
      "id",
      "clientCode",
      "clientName",
      "clientSecret",
      "url",
      "status",
      "description",
      "isDelete",
      "createTime",
      "updateTime",
    ],
    [
      "id",
      "clientCode",
      "clientName",
      "clientSecret",
      "url",
      "status",
      "description",
      "isDelete",
      "createTime",
      "updateTime",
    ],
  ]);
});
