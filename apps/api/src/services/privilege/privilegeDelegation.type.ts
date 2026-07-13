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

export interface PrivilegeDelegationStatusRecord {
  status: PrivilegeDelegationStatus;
}

export interface PrivilegeDelegationConflict {
  delegationDetails: Array<{
    privilege: {
      privilegeCode: string;
    };
  }>;
}
