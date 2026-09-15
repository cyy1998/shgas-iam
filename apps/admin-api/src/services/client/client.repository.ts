import type { DbClient } from "@iam/db";
import type {
  ClientCreateDto,
  ClientInputDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import { extractPostgresError } from "@iam/db/postgres-error";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import { clients } from "@iam/db/schema";
import { ClientCodeExistsError } from "@iam/domain/client";
import { and, count, eq, isNotNull, or, sql } from "drizzle-orm";
import { toAdminClientRecord } from "./client.schema";

const columns = {
  id: clients.id,
  clientCode: clients.clientCode,
  clientName: clients.clientName,
  clientSecret: clients.clientSecret,
  url: clients.url,
  status: clients.status,
  description: clients.description,
  isDelete: clients.isDelete,
  createTime: clients.createTime,
  updateTime: clients.updateTime,
  ssoEnabled: clients.ssoEnabled,
  ssoConfig: clients.ssoConfig,
  hasSsoSecret: isNotNull(clients.ssoSecret),
};

export function createClientRepository(db: DbClient) {
  return {
    async createClient(clientDto: ClientCreateDto) {
      const { extAttributes, ...data } = clientDto;
      try {
        const rows = await db
          .insert(clients)
          .values({
            ...data,
            extAttributes: sql`${JSON.stringify(extAttributes)}::jsonb`,
          })
          .returning(columns);
        const row = firstRow(rows);
        return row === null ? null : toAdminClientRecord(row);
      }
      catch (error) {
        const detail = extractPostgresError(error);
        if (
          detail?.code === "23505"
          && (detail.constraint === "client_client_code_unique"
            || detail.constraint === "client_client_code_key")
        ) {
          throw new ClientCodeExistsError();
        }
        throw error;
      }
    },
    async getClientByCode(clientCode: string) {
      const row = firstRow(
        await db
          .select(columns)
          .from(clients)
          .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false))),
      );
      return row === null ? null : toAdminClientRecord(row);
    },
    async lockClientByCode(clientCode: string) {
      const row = firstRow(
        await db
          .select(columns)
          .from(clients)
          .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
          .for("update"),
      );
      return row === null ? null : toAdminClientRecord(row);
    },
    async lockClientById(id: number) {
      const row = firstRow(
        await db
          .select(columns)
          .from(clients)
          .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
          .for("update"),
      );
      return row === null ? null : toAdminClientRecord(row);
    },
    async getAnyClientByCode(clientCode: string) {
      const row = firstRow(await db.select(columns).from(clients).where(eq(clients.clientCode, clientCode)));
      return row === null ? null : toAdminClientRecord(row);
    },
    async getClientById(id: number) {
      const row = firstRow(
        await db
          .select(columns)
          .from(clients)
          .where(and(eq(clients.id, id), eq(clients.isDelete, false))),
      );
      return row === null ? null : toAdminClientRecord(row);
    },
    async searchClientsPaged(dto: ClientPaginationQueryDto) {
      const where = clientsSearchWhere(dto);
      const [rows, totalRows] = await Promise.all([
        db
          .select(columns)
          .from(clients)
          .where(where)
          .orderBy(clients.id)
          .limit(dto.pageSize)
          .offset((dto.pageNum - 1) * dto.pageSize),
        db.select({ value: count() }).from(clients).where(where),
      ]);
      return {
        rows: rows.map(toAdminClientRecord),
        total: firstRow(totalRows)?.value ?? 0,
      };
    },
    async updateClientByCode(clientCode: string, data: ClientUpdateDto) {
      const rows = await db
        .update(clients)
        .set(toClientStorageUpdate(data))
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning(columns);
      const row = firstRow(rows);
      return row === null ? null : toAdminClientRecord(row);
    },
  };
}

export type ClientRepository = ReturnType<typeof createClientRepository>;

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
    exactConditions.ssoEnabled === undefined ? undefined : eq(clients.ssoEnabled, exactConditions.ssoEnabled),
    exactConditions.ssoProtocols === undefined
      ? undefined
      : exactConditions.ssoProtocols.length === 0
        ? sql`false`
        : or(
            ...exactConditions.ssoProtocols.map(
              protocol => sql`${clients.ssoConfig}->>'protocol' = ${protocol}`,
            ),
          ),
    eq(clients.isDelete, false),
  );
}

function toClientStorageUpdate(data: ClientUpdateDto | Omit<ClientInputDto, "clientCode" | "id">) {
  const { extAttributes, ...update } = compactUpdate(data);
  if (extAttributes === undefined)
    return update;
  return {
    ...update,
    extAttributes: sql`${JSON.stringify(extAttributes)}::jsonb`,
  };
}
