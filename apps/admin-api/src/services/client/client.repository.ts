import type { DbClient } from "@iam/db";
import type {
  AdminClientOidcUpdate,
  ClientCreateDto,
  ClientInputDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import { OidcClientState } from "@iam/contracts";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import { clients } from "@iam/db/schema";
import { and, count, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

export function createClientRepository(db: DbClient) {
  return {
    async createClient(clientDto: ClientCreateDto) {
      const rows = await db.insert(clients).values(clientDto).returning();
      return firstRow(rows)!;
    },
    async getClientByCode(clientCode: string) {
      return await db.query.clients.findFirst({
        where: {
          clientCode,
          isDelete: false,
        },
      }) ?? null;
    },
    async getAnyClientByCode(clientCode: string) {
      return await db.query.clients.findFirst({
        where: { clientCode },
      }) ?? null;
    },
    async getClientById(id: number) {
      return await db.query.clients.findFirst({
        where: {
          id,
          isDelete: false,
        },
      }) ?? null;
    },
    async searchClientsPaged(dto: ClientPaginationQueryDto) {
      const where = clientsSearchWhere(dto);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(clients)
          .where(where)
          .orderBy(clients.id)
          .limit(dto.pageSize)
          .offset((dto.pageNum - 1) * dto.pageSize),
        db.select({ value: count() }).from(clients).where(where),
      ]);
      return { rows, total: firstRow(totalRows)?.value ?? 0 };
    },
    async updateClientByCode(clientCode: string, data: ClientUpdateDto) {
      const rows = await db
        .update(clients)
        .set(compactUpdate(data))
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return firstRow(rows)!;
    },
    async updateClientByCodeWithOidcVersion(clientCode: string, data: ClientUpdateDto) {
      const rows = await db
        .update(clients)
        .set({ ...compactUpdate(data), oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return firstRow(rows)!;
    },
    async updateClientById(clientDto: ClientInputDto) {
      const { id, clientCode: _clientCode, ...data } = clientDto;
      const rows = await db
        .update(clients)
        .set(compactUpdate(data))
        .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
        .returning();
      return firstRow(rows)!;
    },
    async updateClientByIdWithOidcVersion(clientDto: ClientInputDto) {
      const { id, clientCode: _clientCode, ...data } = clientDto;
      const rows = await db
        .update(clients)
        .set({ ...compactUpdate(data), oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
        .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
        .returning();
      return firstRow(rows)!;
    },
    async updateClientOidcByCode(clientCode: string, data: AdminClientOidcUpdate) {
      const rows = await db
        .update(clients)
        .set({ ...data, oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return firstRow(rows)!;
    },
    async softDeleteClientByCode(clientCode: string) {
      const rows = await db
        .update(clients)
        .set({ isDelete: true, oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return firstRow(rows)!;
    },
  };
}

export type ClientRepository = ReturnType<typeof createClientRepository>;

function managementLevelsWhere(values: ClientPaginationQueryDto["conditions"]["exactConditions"]["managementLevels"]) {
  if (values === undefined) {
    return undefined;
  }
  if (values.length === 0) {
    return sql`false`;
  }
  return or(...values.map(value => sql`${clients.extAttributes}->>'managementLevel' = ${value}`));
}

function oidcStatesWhere(values: ClientPaginationQueryDto["conditions"]["exactConditions"]["oidcStates"]) {
  if (values === undefined)
    return undefined;
  if (values.length === 0)
    return sql`false`;
  return or(...values.map((value) => {
    if (value === OidcClientState.Unconfigured)
      return isNull(clients.oidcConfig);
    if (value === OidcClientState.Disabled) {
      return and(isNotNull(clients.oidcConfig), eq(clients.oidcEnabled, false));
    }
    return eq(clients.oidcEnabled, true);
  }));
}

function oidcClientTypesWhere(values: ClientPaginationQueryDto["conditions"]["exactConditions"]["oidcClientTypes"]) {
  if (values === undefined)
    return undefined;
  if (values.length === 0)
    return sql`false`;
  return or(...values.map(value => sql`${clients.oidcConfig}->>'clientType' = ${value}`));
}

function oidcAllowedScopesWhere(values: ClientPaginationQueryDto["conditions"]["exactConditions"]["oidcAllowedScopes"]) {
  if (values === undefined)
    return undefined;
  if (values.length === 0)
    return sql`false`;
  return or(...values.map(value => sql`${clients.oidcConfig}->'allowedScopes' ? ${value}`));
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
    oidcStatesWhere(exactConditions.oidcStates),
    oidcClientTypesWhere(exactConditions.oidcClientTypes),
    oidcAllowedScopesWhere(exactConditions.oidcAllowedScopes),
    eq(clients.isDelete, false),
  );
}
