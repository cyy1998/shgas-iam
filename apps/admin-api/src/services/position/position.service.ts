import { adminAuditTransactionOptions, type AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { PositionStatus } from "@iam/contracts";
import type { AdminPositionServiceDeps, AdminPositionTransactionPorts } from "./position.port";
import type { PositionCreateDto, PositionUpdateDto } from "./position.type";
import { buildPositionAudit } from "@admin-api/services/audit/events/position.audit";
import {
  PositionCodeExistsError,
  PositionHasEmploymentError,
  PositionNotFoundError,
} from "@iam/domain/position";
import { PositionDtoSchema } from "./position.schema";

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
  async function setPosition(positionCreateDto: PositionCreateDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existingPos = await tx.positionRepository.getAnyPositionByCode(positionCreateDto.posCode);
      if (existingPos !== null) {
        throw new PositionCodeExistsError("重复岗位code代码");
      }
      await tx.positionRepository.setPosition(positionCreateDto);
      await tx.auditService.recordAuditLog(buildPositionAudit("admin.position.create", positionCreateDto, {
        description: positionCreateDto.description ?? null,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function getPositionDetailByCode(posCode: string) {
    const pos = await deps.positionRepository.getPositionByCode(posCode);
    if (pos === null) {
      throw new PositionNotFoundError("岗位不存在");
    }
    return PositionDtoSchema.parse(pos);
  }

  async function updatePosition(
    posCode: string,
    data: PositionUpdateDto,
    auditContext?: AdminAuditContext,
    action = "admin.position.update",
  ) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.positionRepository.getPositionByCode(posCode);
      if (existing === null) {
        throw new PositionNotFoundError("岗位不存在");
      }
      await assertRenamedPositionCodeAvailable(posCode, data.posCode, tx);
      await tx.positionRepository.updatePositionByCode(posCode, data);
      await tx.auditService.recordAuditLog(buildPositionAudit(action, {
        ...existing,
        posCode: data.posCode ?? existing.posCode,
        posName: data.posName ?? existing.posName,
        status: data.status ?? existing.status,
      }, {
        patch: data,
        previousPosCode: posCode,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updatePositionStatus(posCode: string, status: PositionStatus, auditContext?: AdminAuditContext) {
    return await updatePosition(posCode, { status }, auditContext, "admin.position.status_update");
  }

  async function deletePosition(posCode: string, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.positionRepository.getPositionByCode(posCode);
      if (existing === null) {
        throw new PositionNotFoundError("岗位不存在");
      }
      const employmentCount = await tx.positionRepository.countActiveEmploymentsByPosCode(posCode);
      if (employmentCount > 0) {
        throw new PositionHasEmploymentError();
      }
      await tx.positionRepository.softDeletePositionByCode(posCode);
      await tx.auditService.recordAuditLog(buildPositionAudit("admin.position.delete", existing, {
        deleted: true,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return {
    deletePosition,
    getPositionDetailByCode,
    setPosition,
    updatePosition,
    updatePositionStatus,
  };
}

export type PositionService = ReturnType<typeof createPositionService>;
