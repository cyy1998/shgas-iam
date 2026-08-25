import { EmploymentDetailDtoSchema, EmploymentDtoSchema } from "@admin-api/services/employment/employment.schema";
import { z } from "@hono/zod-openapi";
import { AdminEmploymentAllowedActionsSchema, employmentStatusToString } from "@iam/contracts";

export const EmploymentVoSchema = EmploymentDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("EmploymentVo");

export function toEmploymentVo(input: unknown) {
  const parsed = EmploymentDtoSchema.parse(input);
  return EmploymentVoSchema.parse({
    ...parsed,
    statusText: employmentStatusToString[parsed.status],
  });
}

export const EmploymentDetailVoSchema = EmploymentDetailDtoSchema.extend({
  allowedActions: AdminEmploymentAllowedActionsSchema,
  statusText: z.string().openapi({ example: "正常" }),
  privileges: z.array(z.string()).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentDetailVo");

export function toEmploymentDetailVo(input: unknown, allowedActions: unknown) {
  const parsed = EmploymentDetailDtoSchema.parse(input);
  return EmploymentDetailVoSchema.parse({
    ...parsed,
    allowedActions,
    privileges: parsed.privileges ?? [],
    roles: parsed.roles ?? [],
    statusText: employmentStatusToString[parsed.status],
  });
}
