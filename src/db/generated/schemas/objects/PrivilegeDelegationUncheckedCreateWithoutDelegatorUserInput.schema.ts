import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailUncheckedCreateNestedManyWithoutDelegationInputObjectSchema as DelegationDetailUncheckedCreateNestedManyWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  delegateeUserId: z.number().int(),
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
export const PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput>;
export const PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInputObjectZodSchema = makeSchema();
