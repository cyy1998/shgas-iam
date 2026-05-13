import { EmploymentSchema } from "@admin-api/services/employment/employment.schema";
import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { PositionStatus } from "@iam/contracts";
import { selectPositionSchema } from "@iam/db/schema";

export const PositionSchema = z.object(selectPositionSchema.shape);

export const PositionDetailSchema = PositionSchema.extend({
  employments: z.lazy(() => z.array(EmploymentSchema)),
});

export const PositionDtoSchema = PositionSchema.extend({
  status: z.enum(PositionStatus),
}).required().openapi("PositionDto");

export const PositionCreateDtoSchema = PositionSchema.omit({
  id: true,
  createTime: true,
  updateTime: true,
  isDelete: true,
}).partial().required({
  posCode: true,
  posName: true,
});

export const PositionQueryDtoSchema = z.object({
  posCodes: z.array(z.string()).openapi({ example: ["E001", "E002"] }),
  posNames: z.array(z.string()).openapi({ example: ["董事长", "总经理"] }),
}).partial().openapi("PositionQueryDto");

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
