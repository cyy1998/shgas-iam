import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { ClientSsoConfig } from "@iam/contracts";
import type { ClientSsoServiceDeps } from "./client-sso.port";
import type { ClientSsoRecord, ClientSsoSave, ClientSsoStorageUpdate } from "./client-sso.type";
import { buildAdminResourceAudit } from "@admin-api/services/audit/admin-resource-audit";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { createAdminClientMutation } from "@admin-api/services/client/client-mutation";
import { INTERNAL_SERVER_ERROR } from "@iam/api-core/core/http-status-codes";
import { BadRequestError, CustomError } from "@iam/api-core/errors";
import { ApiErrorCode, ClientSsoCallbackType, ClientSsoProtocol, OidcClientType } from "@iam/contracts";
import { ClientNotFoundError, normalizeClientSsoConfig, toClientSsoAdminDto } from "@iam/domain/client";
import { ClientSsoSaveSchema, ClientSsoSelectSchema } from "./client-sso.schema";

export function createClientSsoService(deps: ClientSsoServiceDeps) {
  const mutation = createAdminClientMutation(deps);
  async function detail(clientCode: string) {
    const client = await deps.client.getDetail(clientCode);
    if (!client)
      throw new ClientNotFoundError();
    return client;
  }

  async function deleteClient(clientCode: string, auditContext?: AdminAuditContext) {
    const termination = deps.sessionTermination;
    if (!termination)
      throw new Error("Client session termination must be configured");
    return await mutation.transaction(async (tx, bindTarget) => {
      const client = await tx.client.lock(clientCode, true);
      if (!client)
        throw new ClientNotFoundError();
      return await bindTarget(client.clientCode, async () => {
        const changed = !client.isDelete;
        if (changed && !await tx.client.update(client.clientCode, { isDelete: true }))
          throw new Error("Locked Client disappeared during deletion");
        await tx.audit.recordAuditLog(buildAdminResourceAudit("admin.client.delete", {
          type: "client",
          id: client.id,
          code: client.clientCode,
          name: client.clientName,
        }, { changed, deleted: true }, auditContext));
        tx.afterCommit.required("admin.client.sessions.terminate", async () => {
          await termination.revokeClientSessions(client.clientCode);
        });
        return { changed, result: null };
      });
    }, adminAuditTransactionOptions(auditContext));
  }

  async function write(
    clientCode: string,
    action: string,
    intentAudit: boolean,
    patchFor: (client: ClientSsoRecord) => ClientSsoStorageUpdate,
    auditContext?: AdminAuditContext,
  ) {
    return mutation.transaction(async (tx, bindTarget) => {
      const client = await tx.client.lock(clientCode);
      if (!client)
        throw new ClientNotFoundError();
      return bindTarget(client.clientCode, async () => {
        const patch = patchFor(client);
        const changed = Object.entries(patch).some(([key, value]) => {
          const current = key === "ssoConfig" && client.ssoConfig !== null
            ? normalizeClientSsoConfig(client.ssoConfig)
            : client[key as keyof ClientSsoRecord];
          return JSON.stringify(current) !== JSON.stringify(value);
        });
        const result = changed ? await tx.client.update(client.clientCode, patch) : client;
        if (!result)
          throw new Error("Locked Client disappeared during update");
        if (changed || intentAudit) {
          await tx.audit.recordAuditLog(buildAdminResourceAudit(action, {
            type: "client",
            id: client.id,
            code: client.clientCode,
            name: client.clientName,
          }, {
            changed,
            protocol: result.ssoConfig?.protocol ?? null,
            ssoEnabled: result.ssoEnabled,
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            changedFields: Object.keys(patch).filter(key => !key.startsWith("ssoSecret")),
            ...(patch.ssoCredentialId !== undefined ? { credentialId: result.ssoCredentialId } : {}),
          }, auditContext));
        }
        return { changed, result: toClientSsoAdminDto(result) };
      });
    }, adminAuditTransactionOptions(auditContext));
  }

  function secretIfRequired(client: ClientSsoRecord, config: ClientSsoConfig | null): ClientSsoStorageUpdate {
    if (client.ssoSecret !== null || config === null)
      return {};
    const required = config.protocol === ClientSsoProtocol.Oidc
      ? config.clientType === OidcClientType.Confidential
      : config.callbackType === ClientSsoCallbackType.Business;
    if (!required)
      return {};
    const credential = deps.credentials.create();
    return { ssoSecret: credential.secret, ssoCredentialId: credential.id, ssoSecretUpdatedAt: credential.updatedAt };
  }

  function selectProtocol(clientCode: string, config: ClientSsoConfig | null, context?: AdminAuditContext) {
    const parsed = ClientSsoSelectSchema.parse({ config }).config;
    const normalized = parsed === null ? null : normalizeClientSsoConfig(parsed);
    return write(clientCode, "admin.client.sso_select", true, client => ({
      ssoConfig: normalized,
      ...(normalized === null ? { ssoEnabled: false } : {}),
      ...secretIfRequired(client, normalized),
    }), context);
  }

  function setEnabled(clientCode: string, enabled: boolean, context?: AdminAuditContext) {
    return write(clientCode, "admin.client.sso_enabled", true, (client) => {
      if (enabled && client.ssoConfig === null)
        throw new BadRequestError("未配置 SSO，不能启用");
      return { ssoEnabled: enabled, ...(enabled ? secretIfRequired(client, client.ssoConfig) : {}) };
    }, context);
  }

  function save(clientCode: string, input: ClientSsoSave, context?: AdminAuditContext) {
    const patch = ClientSsoSaveSchema.parse(input);
    return write(clientCode, "admin.client.update", patch.status !== undefined, () => patch, context);
  }
  function rotateSecret(clientCode: string, context?: AdminAuditContext) {
    return write(clientCode, "admin.client.sso_secret_rotate", true, () => {
      const credential = deps.credentials.create();
      return { ssoSecret: credential.secret, ssoCredentialId: credential.id, ssoSecretUpdatedAt: credential.updatedAt };
    }, context);
  }

  async function readSecret(clientCode: string, context?: AdminAuditContext) {
    try {
      // This audited read deliberately bypasses authentication caches and mutation invalidation.
      return await deps.uow.transaction(async (tx) => {
        const client = await tx.client.get(clientCode);
        if (!client)
          throw new ClientNotFoundError();
        await tx.audit.recordAuditLog(buildAdminResourceAudit("admin.client.sso_secret_read", {
          type: "client",
          id: client.id,
          code: client.clientCode,
          name: client.clientName,
        }, { credentialId: client.ssoCredentialId }, context));
        return client.ssoSecret === null
          ? null
          : {
              secret: client.ssoSecret,
              credentialId: client.ssoCredentialId!,
              updatedAt: new Date(client.ssoSecretUpdatedAt!).toISOString(),
            };
      }, adminAuditTransactionOptions(context));
    }
    catch (error) {
      if (error instanceof ClientNotFoundError)
        throw error;
      // Do not retain driver errors/parameters in a cause which a protocol logger could serialize.
      throw new CustomError("当前 Secret 读取审计未确认，未交付凭据；可主动重新读取", {
        code: ApiErrorCode.AdminClientSecretReadAuditFailed,
        httpStatus: INTERNAL_SERVER_ERROR,
      });
    }
  }
  return { detail, save, selectProtocol, setEnabled, rotateSecret, readSecret, deleteClient };
}
export type ClientSsoService = ReturnType<typeof createClientSsoService>;
