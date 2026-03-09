import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  delegateeUserId: z.number().int(),
  organizationScopeId: z.number().int(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PrivilegeDelegationCreateManyDelegatorUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateManyDelegatorUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateManyDelegatorUserInput>;
export const PrivilegeDelegationCreateManyDelegatorUserInputObjectZodSchema = makeSchema();
