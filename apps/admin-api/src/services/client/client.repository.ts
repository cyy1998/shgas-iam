import type { DbClient } from "@iam/db";
import type {
  AdminClientCustomSsoUpdate,
  AdminClientOidcUpdate,
  ClientCreateDto,
  ClientInputDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import {
  CustomSsoClientState,
  OidcClientState,
} from "@iam/contracts";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import { clients } from "@iam/db/schema";
import { and, count, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { toAdminClientRecord } from "./client.schema";

export function createClientRepository(db: DbClient) {
  return {
    async createClient(clientDto: ClientCreateDto) {
      const { extAttributes, ...data } = clientDto;
      const rows = await db.insert(clients).values({
        ...data,
        extAttributes: sql`${JSON.stringify(extAttributes)}::jsonb`,
      }).returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
    async getClientByCode(clientCode: string) {
      const row = await db.query.clients.findFirst({
        where: {
          clientCode,
          isDelete: false,
        },
      });
      return row === undefined ? null : toAdminClientRecord(row);
    },
    async lockClientByCode(clientCode: string) {
      const row = firstRow(await db
        .select()
        .from(clients)
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .for("update"));
      return row === undefined ? null : toAdminClientRecord(row);
    },
    async lockClientById(id: number) {
      const row = firstRow(await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
        .for("update"));
      return row === undefined ? null : toAdminClientRecord(row);
    },
    async getAnyClientByCode(clientCode: string) {
      const row = await db.query.clients.findFirst({
        where: { clientCode },
      });
      return row === undefined ? null : toAdminClientRecord(row);
    },
    async getClientById(id: number) {
      const row = await db.query.clients.findFirst({
        where: {
          id,
          isDelete: false,
        },
      });
      return row === undefined ? null : toAdminClientRecord(row);
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
        .returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
    async updateClientByCodeWithProtocolEpochs(clientCode: string, data: ClientUpdateDto) {
      const rows = await db
        .update(clients)
        .set({
          ...toClientStorageUpdate(data),
          customSsoConfigVersion:
            sql`${clients.customSsoConfigVersion} + 1`,
          oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1`,
        })
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
    async updateClientById(clientDto: ClientInputDto) {
      const { id, clientCode: _clientCode, ...data } = clientDto;
      const rows = await db
        .update(clients)
        .set(toClientStorageUpdate(data))
        .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
        .returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
    async updateClientByIdWithProtocolEpochs(clientDto: ClientInputDto) {
      const { id, clientCode: _clientCode, ...data } = clientDto;
      const rows = await db
        .update(clients)
        .set({
          ...toClientStorageUpdate(data),
          customSsoConfigVersion:
            sql`${clients.customSsoConfigVersion} + 1`,
          oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1`,
        })
        .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
        .returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
    async updateClientOidcByCode(clientCode: string, data: AdminClientOidcUpdate) {
      const rows = await db
        .update(clients)
        .set({ ...data, oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
    async updateClientCustomSsoByCode(clientCode: string, data: AdminClientCustomSsoUpdate) {
      const rows = await db
        .update(clients)
        .set({ ...data, customSsoConfigVersion: sql`${clients.customSsoConfigVersion} + 1` })
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
    async softDeleteClientByCode(clientCode: string) {
      const rows = await db
        .update(clients)
        .set({
          isDelete: true,
          customSsoConfigVersion:
            sql`${clients.customSsoConfigVersion} + 1`,
          oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1`,
        })
        .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
        .returning();
      return toAdminClientRecord(firstRow(rows)!);
    },
  };
}

export type ClientRepository = ReturnType<typeof createClientRepository>;

function customSsoStatesWhere(values: ClientPaginationQueryDto["conditions"]["exactConditions"]["customSsoStates"]) {
  if (values === undefined)
    return undefined;
  if (values.length === 0)
    return sql`false`;
  return or(...values.map((value) => {
    if (value === CustomSsoClientState.Unconfigured)
      return isNull(clients.customSsoConfig);
    if (value === CustomSsoClientState.Disabled) {
      return and(isNotNull(clients.customSsoConfig), eq(clients.customSsoEnabled, false));
    }
    return eq(clients.customSsoEnabled, true);
  }));
}

function customSsoModesWhere(values: ClientPaginationQueryDto["conditions"]["exactConditions"]["customSsoModes"]) {
  if (values === undefined)
    return undefined;
  if (values.length === 0)
    return sql`false`;
  return or(
    ...values.map(
      value => sql`${clients.customSsoConfig}->>'mode' = ${value}`,
    ),
  );
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
    customSsoStatesWhere(exactConditions.customSsoStates),
    customSsoModesWhere(exactConditions.customSsoModes),
    oidcStatesWhere(exactConditions.oidcStates),
    oidcClientTypesWhere(exactConditions.oidcClientTypes),
    oidcAllowedScopesWhere(exactConditions.oidcAllowedScopes),
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
