import { z } from "@hono/zod-openapi";
import { PositionSchema as PrismaPositionSchema } from "@/db/generated/schemas";
import { Status } from "@/enums/status";
import { EmploymentSchema } from "@/services/employment/employment.schema";
import { createPageQuerySchema } from "../../lib/core/pagination/schema";

export const PositionSchema = z.object(PrismaPositionSchema.shape);

export const PositionDetailSchema = PositionSchema.extend({
  employments: z.lazy(() => z.array(EmploymentSchema)),
});

export const PositionDtoSchema = PositionSchema.extend({
  status: z.enum(Status),
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
