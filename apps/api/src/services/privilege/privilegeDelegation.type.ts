import type { ApiRequestContext, InternalAuditActor } from "@api/services/audit/audit.context";
import type { z } from "@hono/zod-openapi";
import type { PrivilegeDelegationStatus } from "@iam/contracts";
import type {
  PrivilegeDelegationCreateDtoSchema,
  PrivilegeDelegationDtoSchema,
  PrivilegeDelegationQueryDtoSchema,
  PrivilegeDelegationUpdateDtoSchema,
} from "./privilegeDelegation.schema";

export interface PrivilegeDelegationDto extends z.infer<typeof PrivilegeDelegationDtoSchema> {}
export interface PrivilegeDelegationQueryDto extends z.infer<typeof PrivilegeDelegationQueryDtoSchema> {}
export interface PrivilegeDelegationCreateDto extends z.infer<typeof PrivilegeDelegationCreateDtoSchema> {}
export interface PrivilegeDelegationUpdateDto extends z.infer<typeof PrivilegeDelegationUpdateDtoSchema> {}

export interface PrivilegeDelegationCommandContext {
  actor: InternalAuditActor;
  requestContext?: ApiRequestContext;
}

export interface PrivilegeDelegationRecord {
  id: number;
  delegatorUserId: number;
  delegateeUserId: number;
  organizationScopeId: number;
  privilegeIds: number[];
  startTime: Date;
  endTime: Date;
  description: string | null;
  status: PrivilegeDelegationStatus;
}

export interface PrivilegeDelegationInsert {
  delegatorUserId: number;
  delegateeUserId: number;
  organizationScopeId: number;
  privilegeIds: number[];
  startTime: Date;
  endTime: Date;
  description?: string | null;
}
