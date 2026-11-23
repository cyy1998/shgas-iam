import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { CustomAttributeDefinition, CustomAttributeEntityType } from "@iam/contracts/custom-attributes";
import type { UnitOfWorkPort } from "@iam/unit-of-work";
import type { DefinitionKey } from "./custom-attribute.schema";

export type DefinitionRecord = CustomAttributeDefinition & { id: number };
export type DefinitionChanges = Partial<
  Pick<CustomAttributeDefinition, "displayName" | "description" | "orderNum" | "options" | "enabled">
>;

export interface CustomAttributeDefinitionReader {
  list: (entityType: CustomAttributeEntityType, enabledOnly?: boolean) => Promise<CustomAttributeDefinition[]>;
}

export interface CustomAttributeValueWritePort {
  lockForValues: (entityType: CustomAttributeEntityType, codes: string[]) => Promise<CustomAttributeDefinition[]>;
}

export interface CustomAttributeDefinitionStore {
  insert: (definition: CustomAttributeDefinition) => Promise<DefinitionRecord>;
  lock: (key: DefinitionKey) => Promise<DefinitionRecord | null>;
  update: (id: number, patch: DefinitionChanges) => Promise<DefinitionRecord | null>;
}

type DefinitionDocumentChange = {
  kind: "custom-attribute-definition";
  attributeCode: string;
};

export interface CustomAttributeDefinitionTransactionPorts {
  definitions: CustomAttributeDefinitionStore;
  audit: AuditLogWriterPort;
  userDocumentInvalidation: {
    recordChanges: (
      changes: readonly (DefinitionDocumentChange & { entityType: CustomAttributeEntityType })[],
    ) => Promise<void>;
  };
  organizationDocumentInvalidation: {
    recordChanges: (changes: readonly DefinitionDocumentChange[]) => Promise<void>;
  };
}

export interface CustomAttributeDefinitionServiceDeps {
  reader: CustomAttributeDefinitionReader;
  uow: UnitOfWorkPort<CustomAttributeDefinitionTransactionPorts>;
}
