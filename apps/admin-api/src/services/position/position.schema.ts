import { EmploymentSchema } from "@admin-api/services/employment/employment.schema";
import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { PositionStatus } from "@iam/contracts";
import { insertPositionSchema, updatePositionSchema } from "@iam/db/schema";
import { PositionDtoSchema } from "@iam/domain/position";

export { PositionDtoSchema };

export const PositionDetailSchema = PositionDtoSchema.extend({
  employments: z.lazy(() => z.array(EmploymentSchema)),
});

export const PositionMemberCountDetailSchema = PositionDtoSchema.extend({
  memberNumber: z.number().int().nonnegative(),
});

export const PositionCreateDtoSchema = z.object(insertPositionSchema.shape).openapi("PositionCreateDto");

export const PositionPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "138550" }),
    }),
    exactConditions: z.object({
      statuses: z.array(z.enum(PositionStatus)).optional().openapi({
        example: [PositionStatus.Enable],
      }),
    }),
  }),
).openapi("PositionPaginationQueryDto");

export const PositionUpdateDtoSchema = z.object(updatePositionSchema.shape).openapi("PositionUpdateDto");

export const PositionStatusUpdateDtoSchema = PositionUpdateDtoSchema.pick({
  status: true,
}).required().openapi("PositionStatusUpdateDto");
