import type { DbClient } from "@iam/db";
import type { ClientCreateDto, ClientInputDto } from "./client.type";
import db from "@iam/db";
import { compactUpdate, firstRow } from "@iam/db/query-utils";
import { clients } from "@iam/db/schema";
import { eq } from "drizzle-orm";

export async function getClientByCode(clientCode: string, tx: DbClient = db) {
  return await tx.query.clients.findFirst({
    where: { clientCode },
  }) ?? null;
}

export async function getClientBySecret(clientSecret: string, tx: DbClient = db) {
  return await tx.query.clients.findFirst({
    where: { clientSecret },
  }) ?? null;
}

export async function createClient(clientDto: ClientCreateDto, tx: DbClient = db) {
  const rows = await tx.insert(clients).values(clientDto).returning();
  return firstRow(rows)!;
}

export async function updateClient(clientDto: ClientInputDto, tx: DbClient = db) {
  const { id, ...data } = clientDto;
  const rows = await tx
    .update(clients)
    .set(compactUpdate(data))
    .where(eq(clients.id, id))
    .returning();
  return firstRow(rows)!;
}
