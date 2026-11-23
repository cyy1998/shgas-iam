import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type {
  CustomAttributeDefinitionReader,
  CustomAttributeValueWritePort,
} from "@admin-api/services/custom-attribute/custom-attribute.port";
import type { UnitOfWorkPort } from "@iam/unit-of-work";
import type {
  Position,
  PositionCreateValues,
  PositionFuzzyQueryDto,
  PositionMemberCountDetail,
  PositionSearchResult,
  PositionUpdateValues,
} from "./position.type";

export interface AdminPositionTransactionStorePort {
  lockPositionByCode: (posCode: string) => Promise<Position | null>;
  setPosition: (input: PositionCreateValues) => Promise<Position | null>;
  updatePositionByCode: (posCode: string, input: PositionUpdateValues) => Promise<Position | null>;
  countOpenEmploymentsByPosCode: (posCode: string) => Promise<number>;
  softDeletePositionByCode: (posCode: string) => Promise<Position | null>;
}

export interface AdminPositionReaderPort {
  getPositionDetailByCode: (posCode: string) => Promise<PositionMemberCountDetail | null>;
  searchPositionsFuzzy: (query: PositionFuzzyQueryDto) => Promise<PositionSearchResult>;
}

export interface AdminPositionProfileChange {
  readonly kind: "position";
  readonly positionId: number;
}

export interface AdminPositionTransactionPorts {
  positionRepository: AdminPositionTransactionStorePort;
  customAttributeDefinitions: CustomAttributeValueWritePort;
  auditService: AuditLogWriterPort;
  userDocumentInvalidation: {
    recordChanges: (changes: readonly AdminPositionProfileChange[]) => Promise<void>;
  };
}

export type AdminPositionUnitOfWorkPort = UnitOfWorkPort<AdminPositionTransactionPorts>;

export interface AdminPositionServiceDeps {
  positionRepository: AdminPositionReaderPort;
  customAttributeDefinitions: CustomAttributeDefinitionReader;
  uow: AdminPositionUnitOfWorkPort;
}
