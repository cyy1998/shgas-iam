import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
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
}

export interface AdminPositionUnitOfWorkPort {
  transaction: <T>(callback: (tx: AdminPositionTransactionPorts) => Promise<T>) => Promise<T>;
}

export interface AdminPositionServiceDeps {
  positionRepository: Pick<PositionRepository, "getPositionByCode">;
  uow: AdminPositionUnitOfWorkPort;
}
