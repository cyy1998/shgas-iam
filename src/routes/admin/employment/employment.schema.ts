import { z } from "@hono/zod-openapi";
import { statusToString } from "@/enums/status";
import { EmploymentDtoSchema } from "@/services/employment/employment.schema";

export const EmploymentVoSchema = EmploymentDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("EmploymentVo");

export const EmploymentVoConverterSchema = EmploymentDtoSchema.transform((dto) => {
  // const dto = EmploymentDtoConverterSchema.parse(e);
  return {
    ...dto,
    statusText: statusToString[dto.status],
  };
}).pipe(EmploymentVoSchema);
