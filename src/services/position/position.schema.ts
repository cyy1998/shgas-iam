import { z } from "@hono/zod-openapi";
import { PositionSchema as PrismaPositionSchema } from "@/db/generated/schemas";
import { EmploymentSchema } from "@/services/employment/employment.schema";
import { createPageQuerySchema } from "../../schemas/page.type";

export const PositionSchema = z.object(PrismaPositionSchema.shape);

export const PositionDetailSchema = PositionSchema.extend({
  employments: z.lazy(() => z.array(EmploymentSchema)),
});

export const PositionDtoSchema = PositionSchema.extend({
  memberNumber: z.number().openapi({ example: 10 }),
}).required().openapi("PositionDto");

export const PositionDtoConverterSchema = PositionDetailSchema.transform((e) => {
  const { employments, ...position } = e;
  return {
    ...position,
    memberNumber: employments.length,
  };
}).pipe(PositionDtoSchema);

export const PositionCreateDtoSchema = PositionSchema.omit({
  id: true,
  createTime: true,
  updateTime: true,
  isDelete: true,
}).partial().required({
  posCode: true,
  posName: true,
});

export const PositionFuzzyQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "138550" }),
    }),
    exactConditions: z.object(),
  }),
).openapi("PositionAdminQueryDto");

export const PositionAdminVoSchema = PositionDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("PositionAdminVo");
