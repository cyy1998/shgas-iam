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
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput>;
export const PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInputObjectZodSchema = makeSchema();
