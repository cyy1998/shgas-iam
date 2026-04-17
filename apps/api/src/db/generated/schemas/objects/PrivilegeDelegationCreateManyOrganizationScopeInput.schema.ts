import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  delegatorUserId: z.number().int(),
  delegateeUserId: z.number().int(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PrivilegeDelegationCreateManyOrganizationScopeInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateManyOrganizationScopeInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateManyOrganizationScopeInput>;
export const PrivilegeDelegationCreateManyOrganizationScopeInputObjectZodSchema = makeSchema();
