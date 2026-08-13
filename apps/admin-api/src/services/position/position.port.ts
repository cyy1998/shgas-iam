import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  Position,
  PositionCreateDto,
  PositionFuzzyQueryDto,
  PositionSearchResult,
  PositionUpdateDto,
} from "./position.type";

export interface AdminPositionTransactionStorePort {
  getAnyPositionByCode: (posCode: string) => Promise<Position | null>;
  getPositionByCode: (posCode: string) => Promise<Position | null>;
  setPosition: (input: PositionCreateDto) => Promise<void>;
  updatePositionByCode: (posCode: string, input: PositionUpdateDto) => Promise<unknown>;
  countOpenEmploymentsByPosCode: (posCode: string) => Promise<number>;
  softDeletePositionByCode: (posCode: string) => Promise<unknown>;
}

export interface AdminPositionReaderPort {
  getPositionByCode: (posCode: string) => Promise<Position | null>;
  searchPositionsFuzzy: (query: PositionFuzzyQueryDto) => Promise<PositionSearchResult>;
}

export interface AdminPositionProfileChange {
  readonly kind: "position";
  readonly positionId: number;
}

export interface AdminPositionTransactionPorts {
  positionRepository: AdminPositionTransactionStorePort;
  auditService: AuditLogWriterPort;
  userProfileInvalidation: {
    recordChanges: (changes: readonly AdminPositionProfileChange[]) => Promise<void>;
  };
}

export type AdminPositionUnitOfWorkPort = UnitOfWorkPort<AdminPositionTransactionPorts>;

export interface AdminPositionServiceDeps {
  positionRepository: AdminPositionReaderPort;
  uow: AdminPositionUnitOfWorkPort;
}
