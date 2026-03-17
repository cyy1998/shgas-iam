import { z } from "@hono/zod-openapi";
import { EmploymentSchema as PrismaEmploymentSchema } from "@/db/generated/schemas";

export const EmploymentSchema = z.object(PrismaEmploymentSchema.shape);

// export const EmploymentDtoSchema = Em

export const EmploymentDtoSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  userId: z.number().openapi({ example: 1 }),
  username: z.string().openapi({ example: "138550" }),
  name: z.string().openapi({ example: "138550" }),
  posId: z.number().openapi({ example: 1 }),
  posCode: z.string().openapi({ example: "E033" }),
  posName: z.string().openapi({ example: "职员" }),
  orgId: z.number().openapi({ example: 1 }),
  orgCode: z.string().openapi({ example: "SR23" }),
  orgType: z.string().openapi({ example: "部门" }),
  orgName: z.string().openapi({ example: "信息中心" }),
  compId: z.number().openapi({ example: 1 }),
  compCode: z.string().openapi({ example: "SR" }),
  compName: z.string().openapi({ example: "上海燃气" }),
  isPrimary: z.boolean().openapi({ example: true }),
}).openapi("EmploymentDto");

export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>;

export const EmploymentDetailDtoSchema = EmploymentDtoSchema.extend({
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentDetailDto");

export type EmploymentDetailDto = z.infer<typeof EmploymentDetailDtoSchema>;

export const EmploymentQueryDtoSchema = z.object({
  usernames: z.array(z.string()).optional().openapi({ example: ["138550", "136163"] }),
  phones: z.array(z.string()).optional().openapi({ example: ["17721462865"] }),
  wxIds: z.array(z.string()).optional().openapi({ example: ["1592677631"] }),
  ancestorOrgCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
  ancestorOrgDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  positionCodes: z.array(z.string()).optional().openapi({ example: ["E033", "E034"] }),
  roleCodes: z.array(z.string()).optional().openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentQueryDto");

export type EmploymentQueryDto = z.infer<typeof EmploymentQueryDtoSchema>;
