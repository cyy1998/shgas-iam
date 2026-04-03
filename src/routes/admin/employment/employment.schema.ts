import { z } from "@hono/zod-openapi";
import { statusToString } from "@/enums/status";
import { EmploymentDetailSchema, EmploymentDtoConverterSchema, EmploymentDtoSchema } from "@/services/employment/employment.schema";

export const EmploymentVoSchema = EmploymentDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("EmploymentVo");

export const EmploymentVoConverterSchema = EmploymentDetailSchema.transform((e) => {
  const dto = EmploymentDtoConverterSchema.parse(e);
  return {
    ...dto,
    statusText: statusToString[dto.status],
  };
}).pipe(EmploymentVoSchema);
