import type { z } from "@hono/zod-openapi";
import type { EmploymentStatus } from "@iam/contracts";
import type {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentUpdateDtoSchema,
} from "./employment.schema";

export type EmploymentAdminPaginationQueryDto = z.infer<typeof EmploymentAdminPaginationQueryDtoSchema>;
export type EmploymentAdminCreateDto = z.infer<typeof EmploymentAdminCreateDtoSchema>;
export type EmploymentUpdateDto = z.infer<typeof EmploymentUpdateDtoSchema>;
export type { Employment, EmploymentDetail } from "@iam/domain/employment";

export interface AdminEmploymentRecordCreate {
  userId: number;
  posId: number;
  orgId: number;
  isPrimary: boolean;
  startTime: Date;
  endTime: Date | null;
  description: string | null;
  status: EmploymentStatus;
}

export type AdminEmploymentRecordUpdate = {
  isPrimary?: boolean;
  startTime?: Date;
  endTime?: Date | null;
  description?: string | null;
  status?: EmploymentStatus;
};
