import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailUncheckedCreateNestedManyWithoutDelegationInputObjectSchema as DelegationDetailUncheckedCreateNestedManyWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  delegatorUserId: z.number().int(),
  organizationScopeId: z.number().int(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.number().int().optional(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  delegationDetails: z.lazy(() => DelegationDetailUncheckedCreateNestedManyWithoutDelegationInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput>;
export const PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInputObjectZodSchema = makeSchema();
