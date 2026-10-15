import { expect, test } from "bun:test";
import { createClientRepository } from "@api/services/client/client.repository";
import { ClientStatus } from "@iam/contracts";
import type { GenericClientRecord } from "@iam/domain/client";

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
                  limit: async () => [
                    Object.fromEntries(
                      selectedColumns.map((column) => [column, row[column as keyof GenericClientRecord]]),
                    ),
                  ],
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

test.each([
  { method: "getClientByCode", value: "portal" },
  { method: "getClientBySecret", value: "general-secret" },
] as const)("$method reads only the protocol-neutral projection", async ({ method, value }) => {
  const fake = createSelectDb(genericClientRecord);
  const repository = createClientRepository(fake.db as never);

  const result = await repository[method](value);
  expect(result).toEqual(genericClientRecord);
  const expectedColumns = new Set([
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
  ]);
  expect(fake.selections.length).toBeGreaterThan(0);
  for (const selection of fake.selections) {
    expect(new Set(selection)).toEqual(expectedColumns);
  }
});
