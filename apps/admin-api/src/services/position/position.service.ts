import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildPositionAudit } from "@admin-api/services/audit/events/position.audit";
import {
  prepareCustomAttributeWrite,
  readActiveCustomAttributes,
} from "@admin-api/services/custom-attribute/custom-attribute-values";
import { PositionStatus } from "@iam/contracts";
import { PositionHasEmploymentError, PositionNotFoundError } from "@iam/domain/position";
import { BadRequestError } from "@iam/runtime/errors";
import type { AdminPositionServiceDeps } from "./position.port";
import {
  PositionCreateDtoSchema,
  PositionDtoSchema,
  PositionMemberCountDetailSchema,
  PositionUpdateDtoSchema,
} from "./position.schema";
import type {
  PositionCreateDto,
  PositionFuzzyQueryDto,
  PositionSearchResult,
  PositionUpdateDto,
  PositionUpdateValues,
} from "./position.type";

export function createPositionService(deps: AdminPositionServiceDeps) {
  const mutation = createAdminMutation(deps.uow);
  async function searchPositionsFuzzy(input: PositionFuzzyQueryDto): Promise<PositionSearchResult> {
    return await deps.positionRepository.searchPositionsFuzzy(input);
  }

  async function setPosition(positionCreateDto: PositionCreateDto, auditContext?: AdminAuditContext) {
    const { customAttributes, ...normalizedInput } = PositionCreateDtoSchema.parse(positionCreateDto);
    return await mutation.transaction(async (tx) => {
      const attributes = await prepareCustomAttributeWrite(
        tx.customAttributeDefinitions,
        "position",
        {},
        customAttributes,
      );
      const created = await tx.positionRepository.setPosition({
        ...normalizedInput,
        ...(attributes.changes.length > 0 ? { customAttributes: attributes.values } : {}),
      });
      if (created === null) throw new Error("Position insert returned no row");
      await tx.auditService.recordAuditLog(
        buildPositionAudit(
          "admin.position.create",
          created,
          {
            changed: true,
            description: normalizedInput.description ?? null,
            ...(attributes.changes.length > 0 ? { customAttributeChanges: attributes.changes } : {}),
          },
          auditContext,
        ),
      );
      return {
        changed: true,
        result: {
          ...PositionDtoSchema.parse(created),
          ...(attributes.changes.length > 0 ? { customAttributes: attributes.values } : {}),
        },
      };
    }, adminAuditTransactionOptions(auditContext));
  }

  async function getPositionDetailByCode(posCode: string, includeCustomAttributes = false) {
    const pos = await deps.positionRepository.getPositionDetailByCode(posCode);
    if (pos === null) {
      throw new PositionNotFoundError("岗位不存在");
    }
    const {
      customAttributes,
      customAttributeDefinitions: _definitions,
      ...detail
    } = PositionMemberCountDetailSchema.parse(pos);
    return {
      ...detail,
      ...(includeCustomAttributes
        ? await readActiveCustomAttributes(deps.customAttributeDefinitions, "position", customAttributes ?? {})
        : undefined),
    };
  }

  async function updatePosition(
    posCode: string,
    data: PositionUpdateDto,
    auditContext?: AdminAuditContext,
    action = "admin.position.update",
  ) {
    const { customAttributes, ...normalizedPatch } = PositionUpdateDtoSchema.parse(data);
    if (
      Object.keys(customAttributes ?? {}).length === 0 &&
      !Object.values(normalizedPatch).some((value) => value !== undefined)
    )
      throw new BadRequestError("至少提交一个岗位更新字段");
    return await mutation.locked(
      (tx) => tx.positionRepository.lockPositionByCode(posCode),
      () => new PositionNotFoundError(),
      async (tx, existing) => {
        const attributes = await prepareCustomAttributeWrite(
          tx.customAttributeDefinitions,
          "position",
          existing.customAttributes ?? {},
          customAttributes,
        );
        const updates: PositionUpdateValues = {};
        if (normalizedPatch.posCode !== undefined && normalizedPatch.posCode !== existing.posCode)
          updates.posCode = normalizedPatch.posCode;
        if (normalizedPatch.posName !== undefined && normalizedPatch.posName !== existing.posName)
          updates.posName = normalizedPatch.posName;
        if (normalizedPatch.description !== undefined && normalizedPatch.description !== existing.description)
          updates.description = normalizedPatch.description;
        if (normalizedPatch.status !== undefined && normalizedPatch.status !== existing.status)
          updates.status = normalizedPatch.status;
        if (attributes.changes.length > 0) updates.customAttributes = attributes.values;
        const changed = Object.keys(updates).length > 0;
        const intent = normalizedPatch.status !== undefined;
        if (!changed && !intent) return { changed: false, result: null };
        if (updates.status !== undefined && updates.status !== PositionStatus.Enable) {
          const employmentCount = await tx.positionRepository.countOpenEmploymentsByPosCode(posCode);
          if (employmentCount > 0) {
            throw new PositionHasEmploymentError();
          }
        }
        if (changed) {
          const updated = await tx.positionRepository.updatePositionByCode(posCode, updates);
          if (updated === null) throw new Error("Locked Position update returned no row");
        }
        await tx.auditService.recordAuditLog(
          buildPositionAudit(
            action,
            {
              ...existing,
              posCode: normalizedPatch.posCode ?? existing.posCode,
              posName: normalizedPatch.posName ?? existing.posName,
              status: normalizedPatch.status ?? existing.status,
            },
            {
              patch: normalizedPatch,
              ...(attributes.changes.length > 0 ? { customAttributeChanges: attributes.changes } : {}),
              previousPosCode: posCode,
              changed,
            },
            auditContext,
          ),
        );
        if (changed) {
          await tx.userDocumentInvalidation.recordChanges([{ kind: "position", positionId: existing.id }]);
        }
        return { changed, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function updatePositionStatus(posCode: string, status: PositionStatus, auditContext?: AdminAuditContext) {
    return await updatePosition(posCode, { status }, auditContext, "admin.position.status_update");
  }

  async function deletePosition(posCode: string, auditContext?: AdminAuditContext) {
    return await mutation.locked(
      (tx) => tx.positionRepository.lockPositionByCode(posCode),
      () => new PositionNotFoundError(),
      async (tx, existing) => {
        const employmentCount = await tx.positionRepository.countOpenEmploymentsByPosCode(posCode);
        if (employmentCount > 0) {
          throw new PositionHasEmploymentError();
        }
        const deleted = await tx.positionRepository.softDeletePositionByCode(posCode);
        if (deleted === null) throw new Error("Locked Position delete returned no row");
        await tx.auditService.recordAuditLog(
          buildPositionAudit(
            "admin.position.delete",
            existing,
            {
              deleted: true,
              changed: true,
            },
            auditContext,
          ),
        );
        await tx.userDocumentInvalidation.recordChanges([{ kind: "position", positionId: existing.id }]);
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return {
    deletePosition,
    getPositionDetailByCode,
    searchPositionsFuzzy,
    setPosition,
    updatePosition,
    updatePositionStatus,
  };
}

export type PositionService = ReturnType<typeof createPositionService>;
