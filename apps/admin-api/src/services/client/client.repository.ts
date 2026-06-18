import type { DbClient } from "@iam/db";
import type {
  ClientCreateDto,
  ClientInputDto,
  ClientOidcConfigureDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import { OidcClientState } from "@iam/contracts";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import { clients } from "@iam/db/schema";
import { and, count, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

export function createClientRepository(db: DbClient) {
  return {
    createClient(clientDto: ClientCreateDto) {
      return createClient(clientDto, db);
    },
    getClientByCode(clientCode: string) {
      return getClientByCode(clientCode, db);
    },
    getAnyClientByCode(clientCode: string) {
      return getAnyClientByCode(clientCode, db);
    },
    getClientById(id: number) {
      return getClientById(id, db);
    },
    searchClientsPaged(dto: ClientPaginationQueryDto) {
      return searchClientsPaged(dto, db);
    },
    updateClientByCode(clientCode: string, data: ClientUpdateDto) {
      return updateClientByCode(clientCode, data, db);
    },
    updateClientByCodeWithOidcVersion(clientCode: string, data: ClientUpdateDto) {
      return updateClientByCodeWithOidcVersion(clientCode, data, db);
    },
    updateClientById(clientDto: ClientInputDto) {
      return updateClientById(clientDto, db);
    },
    updateClientByIdWithOidcVersion(clientDto: ClientInputDto) {
      return updateClientByIdWithOidcVersion(clientDto, db);
    },
    updateClientOidcByCode(clientCode: string, data: {
      oidcEnabled?: boolean;
      oidcConfig?: ClientOidcConfigureDto | null;
      oidcSecretHash?: string | null;
    }) {
      return updateClientOidcByCode(clientCode, data, db);
    },
    softDeleteClientByCode(clientCode: string) {
      return softDeleteClientByCode(clientCode, db);
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

async function createClient(clientDto: ClientCreateDto, tx: DbClient) {
  const rows = await tx.insert(clients).values(clientDto).returning();
  return firstRow(rows)!;
}

async function getClientByCode(clientCode: string, tx: DbClient) {
  return await tx.query.clients.findFirst({
    where: {
      clientCode,
      isDelete: false,
    },
  }) ?? null;
}

async function getAnyClientByCode(clientCode: string, tx: DbClient) {
  return await tx.query.clients.findFirst({
    where: { clientCode },
  }) ?? null;
}

async function getClientById(id: number, tx: DbClient) {
  return await tx.query.clients.findFirst({
    where: {
      id,
      isDelete: false,
    },
  }) ?? null;
}

async function searchClientsPaged(dto: ClientPaginationQueryDto, tx: DbClient) {
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

async function updateClientByCode(
  clientCode: string,
  data: ClientUpdateDto,
  tx: DbClient,
) {
  const rows = await tx
    .update(clients)
    .set(compactUpdate(data))
    .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}

async function updateClientByCodeWithOidcVersion(
  clientCode: string,
  data: ClientUpdateDto,
  tx: DbClient,
) {
  const rows = await tx
    .update(clients)
    .set({ ...compactUpdate(data), oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
    .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}

async function updateClientById(clientDto: ClientInputDto, tx: DbClient) {
  const { id, clientCode: _clientCode, ...data } = clientDto;
  const rows = await tx
    .update(clients)
    .set(compactUpdate(data))
    .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}

async function updateClientByIdWithOidcVersion(clientDto: ClientInputDto, tx: DbClient) {
  const { id, clientCode: _clientCode, ...data } = clientDto;
  const rows = await tx
    .update(clients)
    .set({ ...compactUpdate(data), oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
    .where(and(eq(clients.id, id), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}

async function updateClientOidcByCode(
  clientCode: string,
  data: {
    oidcEnabled?: boolean;
    oidcConfig?: ClientOidcConfigureDto | null;
    oidcSecretHash?: string | null;
  },
  tx: DbClient,
) {
  const rows = await tx
    .update(clients)
    .set({ ...data, oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
    .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}

async function softDeleteClientByCode(clientCode: string, tx: DbClient) {
  const rows = await tx
    .update(clients)
    .set({ isDelete: true, oidcConfigVersion: sql`${clients.oidcConfigVersion} + 1` })
    .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
    .returning();
  return firstRow(rows)!;
}
