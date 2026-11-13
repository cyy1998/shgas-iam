import { buildAdminResourceAudit } from "@admin-api/services/audit/admin-resource-audit";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { createAdminClientMutation } from "@admin-api/services/client/client-mutation";
import { UserDocumentFilterSchema } from "@iam/documents/user/document/query";
import { ClientNotFoundError } from "@iam/domain/client";
import { BadRequestError } from "@iam/runtime/errors";
import type { ClientAdmissionServiceDeps } from "./client-admission.port";

function parseAdmissionFilter(filter: unknown) {
  const parsed = UserDocumentFilterSchema.safeParse(filter);
  if (!parsed.success) throw new BadRequestError("应用准入条件无效");
  return parsed.data;
}

export function createClientAdmissionService(deps: ClientAdmissionServiceDeps) {
  const adminClients = new Set(deps.adminClientCodes);
  const mutation = createAdminClientMutation(deps);

  function requireBusinessClient(clientCode: string) {
    if (adminClients.has(clientCode)) throw new ClientNotFoundError();
  }

  async function detail(clientCode: string) {
    requireBusinessClient(clientCode);
    const client = await deps.client.get(clientCode);
    if (!client) throw new ClientNotFoundError();
    const filter = client.filter === null ? null : UserDocumentFilterSchema.safeParse(client.filter);
    if (filter?.success === false) throw new Error("Stored client admission policy is invalid");
    return { enabled: client.enabled, filter: filter?.data ?? null };
  }

  function save(clientCode: string, input: unknown, auditContext?: AdminAuditContext) {
    requireBusinessClient(clientCode);
    const filter = parseAdmissionFilter(input);
    return mutation.transaction(async (tx, bindTarget) => {
      const client = await tx.client.lock(clientCode);
      if (!client) throw new ClientNotFoundError();
      return bindTarget(client.clientCode, async () => {
        const current = UserDocumentFilterSchema.safeParse(client.filter);
        const changed = !current.success || JSON.stringify(current.data) !== JSON.stringify(filter);
        if (changed && !(await tx.client.save(client.clientCode, filter))) {
          throw new Error("Locked Client disappeared during admission policy save");
        }
        await tx.audit.recordAuditLog(
          buildAdminResourceAudit(
            "admin.client.admission.save",
            { type: "client", id: client.id, code: client.clientCode, name: client.clientName },
            { changed, enabled: client.enabled },
            auditContext,
          ),
        );
        return { changed, result: { enabled: client.enabled, filter } };
      });
    }, adminAuditTransactionOptions(auditContext));
  }

  function setEnabled(clientCode: string, enabled: boolean, auditContext?: AdminAuditContext) {
    requireBusinessClient(clientCode);
    return mutation.transaction(async (tx, bindTarget) => {
      const client = await tx.client.lock(clientCode);
      if (!client) throw new ClientNotFoundError();
      if (enabled && !UserDocumentFilterSchema.safeParse(client.filter).success) {
        throw new BadRequestError("开启应用准入前须保存有效条件");
      }
      return bindTarget(client.clientCode, async () => {
        const changed = client.enabled !== enabled;
        if (changed && !(await tx.client.setEnabled(client.clientCode, enabled))) {
          throw new Error("Locked Client disappeared during admission policy state update");
        }
        await tx.audit.recordAuditLog(
          buildAdminResourceAudit(
            "admin.client.admission.enabled",
            { type: "client", id: client.id, code: client.clientCode, name: client.clientName },
            { changed, enabled },
            auditContext,
          ),
        );
        return { changed, result: { enabled } };
      });
    }, adminAuditTransactionOptions(auditContext));
  }

  async function preview(clientCode: string, userId: number, input: unknown) {
    requireBusinessClient(clientCode);
    const filter = parseAdmissionFilter(input);
    const client = await deps.client.get(clientCode);
    if (!client) throw new ClientNotFoundError();
    try {
      const subjectIdentifier = await deps.users.findSubjectIdentifier(userId);
      const status =
        subjectIdentifier === null
          ? "unavailable"
          : await deps.evaluator.evaluate({ clientCode: client.clientCode, subjectIdentifier, filter });
      return { status };
    } catch {
      return { status: "unavailable" } as const;
    }
  }

  return { detail, save, setEnabled, preview };
}

export type ClientAdmissionService = ReturnType<typeof createClientAdmissionService>;
