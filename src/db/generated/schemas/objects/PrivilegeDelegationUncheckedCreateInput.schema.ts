import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  delegatorUserId: z.number().int(),
  delegateeUserId: z.number().int(),
  organizationScopeId: z.number().int(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional()
}).strict();
export const PrivilegeDelegationUncheckedCreateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateInput>;
export const PrivilegeDelegationUncheckedCreateInputObjectZodSchema = makeSchema();
