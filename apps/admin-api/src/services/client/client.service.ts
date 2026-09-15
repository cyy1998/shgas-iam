import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { ClientStatus } from "@iam/contracts";
import type { BindAdminClientMutationTarget } from "./client-mutation";
import type { AdminClientServiceDeps, AdminClientTransactionPorts } from "./client.port";
import type { ClientAdminListDto, ClientCreateDto, ClientInputDto, ClientPaginationQueryDto, ClientUpdateDto } from "./client.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildAdminClientAudit } from "@admin-api/services/audit/events/client.audit";
import { BadRequestError } from "@iam/api-core/errors";
import { ClientCodeExistsError, ClientCodeImmutableError, ClientNotFoundError, toClientAdminDetailDto, toClientAdminListDto, toGenericClientRuntimeDto } from "@iam/domain/client";
import { createAdminClientMutation } from "./client-mutation";

function toPageResult(rows: ClientAdminListDto[], total: number, query: ClientPaginationQueryDto) {
  return {
    result: rows,
    total,
    pageNum: query.pageNum,
    pageSize: query.pageSize,
    pages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}

function assertClientCodeUnchanged(currentClientCode: string, nextClientCode: string | undefined) {
  if (nextClientCode !== undefined && nextClientCode !== currentClientCode) {
    throw new ClientCodeImmutableError();
  }
}

export function createClientService(deps: AdminClientServiceDeps) {
  const clientMutation = createAdminClientMutation({
    invalidation: deps.clientRuntimeInvalidation,
    logger: deps.clientMutationLogger,
    uow: deps.uow,
  });

  const basicMutation = createAdminMutation<AdminClientTransactionPorts & {
    bindTarget: BindAdminClientMutationTarget;
  }>({
    transaction: (command, options) => clientMutation.transaction(
      (tx, bindTarget) => command({ ...tx, bindTarget }),
      options,
    ),
  });

  async function searchClientsForAdmin(query: ClientPaginationQueryDto) {
    const { rows, total } = await deps.clientRepository.searchClientsPaged(query);
    return toPageResult(rows.map(toClientAdminListDto), total, query);
  }

  async function getClientDetailByCode(clientCode: string) {
    const client = await deps.clientRepository.getClientByCode(clientCode);
    if (client === null)
      throw new ClientNotFoundError("客户端不存在");
    return toClientAdminDetailDto(client);
  }

  async function createClient(clientDto: ClientCreateDto, auditContext?: AdminAuditContext) {
    return await basicMutation.transaction(async (tx) => {
      const existing = await tx.clientRepository.getAnyClientByCode(clientDto.clientCode);
      if (existing !== null)
        throw new ClientCodeExistsError("客户端编码已存在");

      return await tx.bindTarget(clientDto.clientCode, async () => {
        const client = await tx.clientRepository.createClient(clientDto);
        if (client === null)
          throw new Error("Client insert returned no row");
        const created = toGenericClientRuntimeDto(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.create", created, {
          changed: true,
          clientSecretProvided: clientDto.clientSecret !== undefined,
        }, auditContext));
        tx.afterCommit.required("admin.client.cache.invalidate", async () => {
          await deps.clientCache.invalidateClient(created);
        });
        return { changed: true, result: toClientAdminDetailDto(client) };
      });
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateClientTarget(
    target: string | { id: number; clientCode?: string },
    data: ClientUpdateDto,
    auditContext?: AdminAuditContext,
    actionOverride?: string,
  ) {
    if (!Object.entries(data).some(([key, value]) => key !== "extAttributes" && value !== undefined))
      throw new BadRequestError("至少提交一个客户端更新字段");
    if (data.clientSecret === undefined && typeof target === "string") {
      const { extAttributes: _attributes, ...patch } = data;
      const result = await deps.management.save(target, patch, auditContext);
      return { changed: result.changed, result: null };
    }
    if (data.clientSecret !== undefined && Object.entries(data).some(([key, value]) => key !== "clientSecret" && key !== "extAttributes" && value !== undefined))
      throw new BadRequestError("Internal API 凭据必须独立更新");
    if (!Object.values(data).some(value => value !== undefined))
      throw new BadRequestError("至少提交一个客户端更新字段");
    return await basicMutation.locked(
      tx => typeof target === "string"
        ? tx.clientRepository.lockClientByCode(target)
        : tx.clientRepository.lockClientById(target.id),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (typeof target !== "string")
          assertClientCodeUnchanged(existing.clientCode, target.clientCode);
        const changed = (data.clientName !== undefined && data.clientName !== existing.clientName)
          || (data.clientSecret !== undefined && data.clientSecret !== existing.clientSecret)
          || (data.url !== undefined && data.url !== existing.url)
          || (data.description !== undefined && data.description !== existing.description)
          || (data.status !== undefined && data.status !== existing.status);
        const client = changed
          ? await tx.clientRepository.updateClientByCode(existing.clientCode, data)
          : existing;
        if (client === null)
          throw new Error("Locked Client update returned no row");
        const parsedExisting = toGenericClientRuntimeDto(existing);
        const parsedUpdated = toGenericClientRuntimeDto(client);
        const secretRotated = data.clientSecret !== undefined && data.clientSecret !== existing.clientSecret;
        if (changed || data.status !== undefined || data.clientSecret !== undefined) {
          const auditPatch: Record<string, unknown> = { ...data };
          if ("clientSecret" in auditPatch) {
            delete auditPatch.clientSecret;
            auditPatch.clientSecretRotated = secretRotated;
          }
          await tx.auditService.recordAuditLog(buildAdminClientAudit(
            actionOverride ?? (secretRotated ? "admin.client.rotate_secret" : "admin.client.update"),
            parsedUpdated,
            { changed, previousClientCode: existing.clientCode, patch: auditPatch },
            auditContext,
          ));
        }
        tx.afterCommit.required("admin.client.cache.invalidate", async () => {
          await deps.clientCache.invalidateUpdatedClient(parsedExisting, parsedUpdated);
        });
        return { changed, result: null };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function updateClient(
    clientCode: string,
    data: ClientUpdateDto,
    auditContext?: AdminAuditContext,
  ) {
    return await updateClientTarget(clientCode, data, auditContext);
  }

  async function updateClientById(clientDto: ClientInputDto, auditContext?: AdminAuditContext) {
    const { id, clientCode, ...data } = clientDto;
    const existing = await deps.clientRepository.getClientById(id);
    if (!existing)
      throw new ClientNotFoundError();
    assertClientCodeUnchanged(existing.clientCode, clientCode);
    return await updateClientTarget(existing.clientCode, data, auditContext);
  }

  async function updateClientStatus(clientCode: string, status: ClientStatus, auditContext?: AdminAuditContext) {
    return await updateClientTarget(clientCode, { status }, auditContext, "admin.client.status_update");
  }

  return {
    createClient,
    searchClientsForAdmin,
    getClientDetailByCode,
    updateClient,
    updateClientById,
    updateClientStatus,
    deleteClient: deps.management.deleteClient,
  };
}
export type ClientService = ReturnType<typeof createClientService>;
