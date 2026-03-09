import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserCreateNestedOneWithoutDelegationToInputObjectSchema as UserCreateNestedOneWithoutDelegationToInputObjectSchema } from './UserCreateNestedOneWithoutDelegationToInput.schema';
import { UserCreateNestedOneWithoutDelegationFromInputObjectSchema as UserCreateNestedOneWithoutDelegationFromInputObjectSchema } from './UserCreateNestedOneWithoutDelegationFromInput.schema';
import { DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema as DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema } from './DelegationDetailCreateNestedManyWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  delegatorUser: z.lazy(() => UserCreateNestedOneWithoutDelegationToInputObjectSchema),
  delegateeUser: z.lazy(() => UserCreateNestedOneWithoutDelegationFromInputObjectSchema),
  delegationDetails: z.lazy(() => DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateWithoutOrganizationScopeInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateWithoutOrganizationScopeInput>;
export const PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectZodSchema = makeSchema();
