import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserCreateNestedOneWithoutDelegationToInputObjectSchema as UserCreateNestedOneWithoutDelegationToInputObjectSchema } from './UserCreateNestedOneWithoutDelegationToInput.schema';
import { UserCreateNestedOneWithoutDelegationFromInputObjectSchema as UserCreateNestedOneWithoutDelegationFromInputObjectSchema } from './UserCreateNestedOneWithoutDelegationFromInput.schema';
import { OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateNestedOneWithoutPrivilegeDelegationsInput.schema';
import { DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema as DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema } from './DelegationDetailCreateNestedManyWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  delegatorUser: z.lazy(() => UserCreateNestedOneWithoutDelegationToInputObjectSchema),
  delegateeUser: z.lazy(() => UserCreateNestedOneWithoutDelegationFromInputObjectSchema),
  organizationScope: z.lazy(() => OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectSchema),
  delegationDetails: z.lazy(() => DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationCreateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateInput>;
export const PrivilegeDelegationCreateInputObjectZodSchema = makeSchema();
