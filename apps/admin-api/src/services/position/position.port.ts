import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type { PositionRepository } from "./position.repository";

export interface AdminPositionTransactionPorts {
  positionRepository: Pick<
    PositionRepository,
    | "getAnyPositionByCode"
    | "getPositionByCode"
    | "setPosition"
    | "updatePositionByCode"
    | "countActiveEmploymentsByPosCode"
    | "softDeletePositionByCode"
  >;
  auditService: AuditLogWriterPort;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markScopeDirty">;
}

export type AdminPositionUnitOfWorkPort = UnitOfWorkPort<AdminPositionTransactionPorts>;

export interface AdminPositionServiceDeps {
  positionRepository: Pick<PositionRepository, "getPositionByCode">;
  uow: AdminPositionUnitOfWorkPort;
}
