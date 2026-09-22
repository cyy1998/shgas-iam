import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AdminPositionServiceDeps, AdminPositionTransactionPorts } from "./position.port";
import type {
  PositionCreateDto,
  PositionFuzzyQueryDto,
  PositionSearchResult,
  PositionUpdateDto,
} from "./position.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildPositionAudit } from "@admin-api/services/audit/events/position.audit";
import { BadRequestError } from "@iam/api-core/errors";
import { PositionStatus } from "@iam/contracts";
import {
  PositionCodeExistsError,
  PositionHasEmploymentError,
  PositionNotFoundError,
} from "@iam/domain/position";
import {
  PositionCreateDtoSchema,
  PositionDtoSchema,
  PositionMemberCountDetailSchema,
  PositionUpdateDtoSchema,
} from "./position.schema";

async function assertRenamedPositionCodeAvailable(
  currentPosCode: string,
  nextPosCode: string | undefined,
  tx: AdminPositionTransactionPorts,
) {
  if (nextPosCode === undefined || nextPosCode === currentPosCode) {
    return;
  }

  const existingPos = await tx.positionRepository.getAnyPositionByCode(nextPosCode);
  if (existingPos !== null) {
    throw new PositionCodeExistsError("重命名岗位编码失败：岗位编码已存在");
  }
}

export function createPositionService(deps: AdminPositionServiceDeps) {
  const mutation = createAdminMutation(deps.uow);
  async function searchPositionsFuzzy(input: PositionFuzzyQueryDto): Promise<PositionSearchResult> {
    return await deps.positionRepository.searchPositionsFuzzy(input);
  }

  async function setPosition(positionCreateDto: PositionCreateDto, auditContext?: AdminAuditContext) {
    const normalizedInput = PositionCreateDtoSchema.parse(positionCreateDto);
    return await mutation.transaction(async (tx) => {
      const existingPos = await tx.positionRepository.getAnyPositionByCode(normalizedInput.posCode);
      if (existingPos !== null) {
        throw new PositionCodeExistsError("重复岗位code代码");
      }
      const created = await tx.positionRepository.setPosition(normalizedInput);
      if (created === null)
        throw new Error("Position insert returned no row");
      await tx.auditService.recordAuditLog(buildPositionAudit("admin.position.create", created, {
        changed: true,
        description: normalizedInput.description ?? null,
      }, auditContext));
      return { changed: true, result: PositionDtoSchema.parse(created) };
    }, adminAuditTransactionOptions(auditContext));
  }

  async function getPositionDetailByCode(posCode: string) {
    const pos = await deps.positionRepository.getPositionDetailByCode(posCode);
    if (pos === null) {
      throw new PositionNotFoundError("岗位不存在");
    }
    return PositionMemberCountDetailSchema.parse(pos);
  }

  async function updatePosition(
    posCode: string,
    data: PositionUpdateDto,
    auditContext?: AdminAuditContext,
    action = "admin.position.update",
  ) {
    const normalizedPatch = PositionUpdateDtoSchema.parse(data);
    if (!Object.values(normalizedPatch).some(value => value !== undefined))
      throw new BadRequestError("至少提交一个岗位更新字段");
    return await mutation.locked(
      tx => tx.positionRepository.lockPositionByCode(posCode),
      () => new PositionNotFoundError(),
      async (tx, existing) => {
        const changed = (normalizedPatch.posCode !== undefined && normalizedPatch.posCode !== existing.posCode)
          || (normalizedPatch.posName !== undefined && normalizedPatch.posName !== existing.posName)
          || (normalizedPatch.description !== undefined && normalizedPatch.description !== existing.description)
          || (normalizedPatch.status !== undefined && normalizedPatch.status !== existing.status);
        const intent = normalizedPatch.status !== undefined;
        if (!changed && !intent)
          return { changed: false, result: null };
        await assertRenamedPositionCodeAvailable(posCode, normalizedPatch.posCode, tx);
        if (changed && normalizedPatch.status !== undefined && normalizedPatch.status !== existing.status
          && normalizedPatch.status !== PositionStatus.Enable) {
          const employmentCount = await tx.positionRepository.countOpenEmploymentsByPosCode(posCode);
          if (employmentCount > 0) {
            throw new PositionHasEmploymentError();
          }
        }
        if (changed) {
          const updated = await tx.positionRepository.updatePositionByCode(posCode, normalizedPatch);
          if (updated === null)
            throw new Error("Locked Position update returned no row");
        }
        await tx.auditService.recordAuditLog(buildPositionAudit(action, {
          ...existing,
          posCode: normalizedPatch.posCode ?? existing.posCode,
          posName: normalizedPatch.posName ?? existing.posName,
          status: normalizedPatch.status ?? existing.status,
        }, {
          patch: normalizedPatch,
          previousPosCode: posCode,
          changed,
        }, auditContext));
        if (changed) {
          await tx.userProfileInvalidation.recordChanges([
            { kind: "position", positionId: existing.id },
          ]);
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
      tx => tx.positionRepository.lockPositionByCode(posCode),
      () => new PositionNotFoundError(),
      async (tx, existing) => {
        const employmentCount = await tx.positionRepository.countOpenEmploymentsByPosCode(posCode);
        if (employmentCount > 0) {
          throw new PositionHasEmploymentError();
        }
        const deleted = await tx.positionRepository.softDeletePositionByCode(posCode);
        if (deleted === null)
          throw new Error("Locked Position delete returned no row");
        await tx.auditService.recordAuditLog(buildPositionAudit("admin.position.delete", existing, {
          deleted: true,
          changed: true,
        }, auditContext));
        await tx.userProfileInvalidation.recordChanges([
          { kind: "position", positionId: existing.id },
        ]);
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
