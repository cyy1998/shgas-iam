import { z } from "@hono/zod-openapi";
import { statusToString } from "@/enums/status";
import { EmploymentDetailDtoSchema, EmploymentDtoSchema } from "@/services/employment/employment.schema";

export const EmploymentVoSchema = EmploymentDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("EmploymentVo");

export const EmploymentVoConverterSchema = EmploymentDtoSchema.transform(dto => ({
  ...dto,
  statusText: statusToString[dto.status],
})).pipe(EmploymentVoSchema);

export const EmploymentDetailVoSchema = EmploymentDetailDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
  privileges: z.array(z.string()).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentDetailVo");

export const EmploymentDetailVoConverterSchema = EmploymentDetailDtoSchema.transform(dto => ({
  ...dto,
  privileges: dto.privileges ?? [],
  roles: dto.roles ?? [],
  statusText: statusToString[dto.status],
})).pipe(EmploymentDetailVoSchema);
