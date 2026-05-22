import type { DbClient } from "@iam/db";
import type { ClientCreateDto, ClientInputDto, ClientPaginationQueryDto, ClientUpdateDto } from "./client.type";
import db from "@iam/db";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import { clients } from "@iam/db/schema";
import { and, count, eq, or, sql } from "drizzle-orm";

function managementLevelsWhere(values: ClientPaginationQueryDto["conditions"]["exactConditions"]["managementLevels"]) {
  if (values === undefined) {
    return undefined;
  }
  if (values.length === 0) {
    return sql`false`;
  }
  return or(...values.map(value => sql`${clients.extAttributes}->>'managementLevel' = ${value}`));
}

function clientsSearchWhere(dto: ClientPaginationQueryDto) {
  const { fuzzyConditions, exactConditions } = dto.conditions;
  const text = fuzzyConditions.text;
  return and(
    text !== undefined
      ? or(
          ilikeContainsIf(clients.clientCode, text),
          ilikeContainsIf(clients.clientName, text),
          ilikeContainsIf(clients.url, text),
          ilikeContainsIf(clients.description, text),
        )
      : undefined,
    inArrayIf(clients.status, exactConditions.statuses),
    managementLevelsWhere(exactConditions.managementLevels),
    eq(clients.isDelete, false),
  );
}

export async function createClient(clientDto: ClientCreateDto, tx: DbClient = db) {
  const rows = await tx.insert(clients).values(clientDto).returning();
  return firstRow(rows)!;
}

export async function getClientByCode(clientCode: string, tx: DbClient = db) {
  return await tx.query.clients.findFirst({
    where: {
      clientCode,
      isDelete: false,
    },
  }) ?? null;
}

export async function getAnyClientByCode(clientCode: string, tx: DbClient = db) {
  return await tx.query.clients.findFirst({
    where: { clientCode },
  }) ?? null;
}

export async function getClientById(id: number, tx: DbClient = db) {
  return await tx.query.clients.findFirst({
    where: {
      id,
      isDelete: false,
    },
  }) ?? null;
}

export async function searchClientsPaged(dto: ClientPaginationQueryDto, tx: DbClient = db) {
  const where = clientsSearchWhere(dto);
  const [rows, totalRows] = await Promise.all([
    tx
      .select()
      .from(clients)
      .where(where)
      .orderBy(clients.id)
      .limit(dto.pageSize)
      .offset((dto.pageNum - 1) * dto.pageSize),
    tx.select({ value: count() }).from(clients).where(where),
  ]);
  return { rows, total: firstRow(totalRows)?.value ?? 0 };
}

export async function updateClientByCode(
  clientCode: string,
  data: ClientUpdateDto,
  tx: DbClient = db,
) {
  const rows = await tx
    .update(clients)
    .set(compactUpdate(data))
    .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}

export async function updateClientById(clientDto: ClientInputDto, tx: DbClient = db) {
  const { id, ...data } = clientDto;
  const rows = await tx
    .update(clients)
    .set(compactUpdate(data))
    .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}

export async function softDeleteClientByCode(clientCode: string, tx: DbClient = db) {
  const rows = await tx
    .update(clients)
    .set({ isDelete: true })
    .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}
