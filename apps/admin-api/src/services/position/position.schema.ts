import { EmploymentSchema } from "@admin-api/services/employment/employment.schema";
import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { PositionStatus } from "@iam/contracts";
import { insertPositionSchema, selectPositionSchema } from "@iam/db/schema";

export const PositionDtoSchema = z.object(selectPositionSchema.shape).required().openapi("PositionDto");

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

export const PositionUpdateDtoSchema = z.object({
  posName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(PositionStatus).optional(),
}).openapi("PositionUpdateDto");

export const PositionStatusUpdateDtoSchema = z.object({
  status: z.enum(PositionStatus),
}).openapi("PositionStatusUpdateDto");
