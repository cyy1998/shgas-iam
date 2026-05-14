import { EmploymentSchema } from "@admin-api/services/employment/employment.schema";
import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { insertPositionSchema, selectPositionSchema, updatePositionSchema } from "@iam/db/schema";

export const PositionDtoSchema = z.object(selectPositionSchema.shape).openapi("PositionDto");

export const PositionDetailSchema = PositionDtoSchema.extend({
  employments: z.lazy(() => z.array(EmploymentSchema)),
});

export const PositionCreateDtoSchema = z.object(insertPositionSchema.shape).openapi("PositionCreateDto");

export const PositionPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "138550" }),
    }),
    exactConditions: z.object(),
  }),
).openapi("PositionPaginationQueryDto");

export const PositionUpdateDtoSchema = z.object(updatePositionSchema.shape).openapi("PositionUpdateDto");

export const PositionStatusUpdateDtoSchema = PositionUpdateDtoSchema.pick({
  status: true,
}).required().openapi("PositionStatusUpdateDto");
